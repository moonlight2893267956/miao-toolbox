package com.miao.toolbox.tool.wubi;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.AiUpstreamErrors;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.annotation.PreDestroy;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 讲解台的**流式**入口：把 miao-ai 的 `/invoke/stream` 原样转给浏览器。
 *
 * <h3>这个端点只做管道</h3>
 *
 * 逐个 SSE 事件转发，**不解释任何语义、不设事件名白名单**。原因是 miao-ai 的
 * 执行事件契约明确承诺「`kind` 不设白名单、事件名只增不改」：一旦这里给事件名
 * 加白名单，平台将来新增事件类型时就会静默断掉，线上只表现为「过程轨少了几步」，
 * 极难归因（miao-ai 侧已用测试把这个隐式契约钉死，见其
 * `backend/tests/test_invoke_exec_passthrough.py`）。
 *
 * <h3>为什么保留同步端点</h3>
 *
 * AI 是**可选增强**：流式握手失败、读流中断、上游报错，任何一步都可能让流不可用。
 * 同步端点（{@link WubiAiController}）保留为零风险兜底，前端在流式失败时回退。
 *
 * <h3>与同步路径的一致项</h3>
 *
 * 会话语义、错误码语义必须与同步路径**完全一致**，否则前端无法复用
 * 「410 自动开新会话并重放首轮」那条链路。上游非 200 时由
 * {@link AiUpstreamErrors} 产出与同步路径同一套码值，再以 `event: error` 下发。
 *
 * <h3>读超时</h3>
 *
 * 流式读取**不设短超时**：单次模型调用可阻塞 70s，且其间流上可能没有任何事件。
 * `SseEmitter` 的超时给到与后端 read-timeout 同量级。
 */
@Slf4j
@RestController
@RequestMapping("/api/wubi/ai")
@RequireRoute("TOOL_WUBI_TUTOR")
@RequiredArgsConstructor
public class WubiAiStreamController {

    /** SseEmitter 存活上限：比 agent 最坏耗时（~145s）留足余量 */
    private static final long EMITTER_TIMEOUT_MS = 200_000L;

    private final WubiAiStreamService streamService;
    private final WubiAiService wubiAiService;
    private final MiaoAiClient miaoAiClient;
    private final MiaoAiProperties miaoAiProperties;

    /**
     * SSE 转发线程池。
     *
     * <p>**有界**而不是 `newCachedThreadPool()`：讲解一次最长 ~145s，慢客户端会让线程
     * 长时间占着；无界池在慢客户端多的时候会持续新建线程，把内存吃光。
     * 上限取 16（讲解台是单用户交互场景，远够用），队列积压时由调用方线程执行 ——
     * 宁可让创建 emitter 的请求线程等一会儿，也不要拒绝用户的讲解请求。
     *
     * <p>容器关闭时显式 `shutdownNow()`：否则这些 daemon=false 的 worker 会拖住 JVM 退出
     * （`Executors.defaultThreadFactory()` 造的是非 daemon 线程）。
     */
    private final ExecutorService sseExecutor = new ThreadPoolExecutor(
            4, 16, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(64),
            new ThreadPoolExecutor.CallerRunsPolicy());

    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 容器关闭：不要再让转发线程拖住 JVM 退出 */
    @PreDestroy
    public void shutdown() {
        sseExecutor.shutdownNow();
    }

    /**
     * POST /api/wubi/ai/explain/stream —— 首轮讲解（SSE）。
     *
     * <p>事件流：`conversation`（可选）→ `exec`×N（工具过程）→ `token`×N（正文，前端丢弃）
     * → `done`（含 `output` 完整结构化结果）。
     */
    @PostMapping(value = "/explain/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter explainStream(@RequestBody Map<String, Object> body) {
        if (!streamService.isAgentEnabled()) {
            // agent 未启用：立刻回错误事件并结束，不让浏览器对着一个空流干等
            return failFast("AI_AGENT_DISABLED", "AI 讲解当前不可用（agent 未启用）", 503);
        }
        try {
            return proxy(streamService.prepareExplain(body), "explain-split");
        } catch (BusinessException e) {
            // 形校验失败 / 建会话异常：走与同步路径一致的映射后以错误事件下发
            BusinessException mapped = mapUpstream(e);
            return failFast(mapped.getErrorCode(), mapped.getMessage(), mapped.getHttpStatus());
        }
    }

    /**
     * POST /api/wubi/ai/followup/stream —— 追问（SSE）。
     */
    @PostMapping(value = "/followup/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter followupStream(@RequestBody Map<String, Object> body) {
        if (!streamService.isAgentEnabled()) {
            return failFast("AI_AGENT_DISABLED", "AI 讲解当前不可用（agent 未启用）", 503);
        }
        try {
            return proxy(streamService.prepareFollowup(body), "followup");
        } catch (BusinessException e) {
            BusinessException mapped = mapUpstream(e);
            return failFast(mapped.getErrorCode(), mapped.getMessage(), mapped.getHttpStatus());
        }
    }

    // ========== 私有方法 ==========

    /**
     * 建一个 emitter 并在后台线程里把上游流逐事件转过去。
     *
     * <p>必须切线程：SSE 的读取是阻塞的（`BufferedReader.readLine`），
     * 在请求线程里读会把 Tomcat 的工作线程占满整个讲解时长。
     */
    private SseEmitter proxy(WubiAiStreamService.StreamRequest request, String action) {
        SecurityContext securityContext = SecurityContextHolder.getContext();
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);

        AiInvocationRecorder.InvocationHandle handle = miaoAiClient.recordStreamStart(
                effectiveAgentName(), truncate(String.valueOf(request.body()), 512));

        /*
         * !! 一次调用只记一次账 !!
         *
         * `AiInvocationRecorder` 没有幂等保护：`recordSuccess` / `recordFailure`
         * 每次都 `repository.save` 一条新记录。而 SSE 的失败路径天然会重叠 ——
         * 上游非 2xx 时先 `recordStreamFailure`，随后 `sendError` 抛异常又进 catch
         * 再记一次；`emitter.onTimeout` / `onError` 也会与 doProxy 的异常路径叠加。
         * 结果同一次调用在 `ai_invocations` 里出现两条（甚至三条）记录，
         * 失败率与耗时分母全部虚高。用 CAS 守卫兜住。
         */
        AtomicBoolean accounted = new AtomicBoolean(false);

        sseExecutor.execute(() -> {
            SecurityContextHolder.setContext(securityContext);
            try {
                doProxy(request, action, emitter, handle, accounted);
            } finally {
                SecurityContextHolder.clearContext();
            }
        });

        emitter.onTimeout(() -> {
            log.warn("wubi SSE emitter timeout: action={}", action);
            if (accounted.compareAndSet(false, true)) {
                miaoAiClient.recordStreamFailure(handle, "SSE_TIMEOUT", "SSE 连接超时");
            }
        });
        emitter.onError(ex -> {
            log.warn("wubi SSE emitter error: action={}, {}", action, ex.getMessage());
            if (accounted.compareAndSet(false, true)) {
                miaoAiClient.recordStreamFailure(handle, "SSE_ERROR", ex.getMessage());
            }
        });

        return emitter;
    }

    /**
     * 真正的转发循环：按 SSE 规范（`event:` / `data:` / 空行分隔）逐事件转发。
     *
     * <p>未知事件名照样转发 —— 这是与 miao-ai 契约对齐的关键（见类注释）。
     */
    private void doProxy(WubiAiStreamService.StreamRequest request, String action,
                         SseEmitter emitter, AiInvocationRecorder.InvocationHandle handle,
                         AtomicBoolean accounted) {
        HttpURLConnection conn = null;
        try {
            MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(
                    WubiAiStreamService.AGENT_KEY);

            log.info("wubi SSE proxy: connecting, action={}", action);
            conn = (HttpURLConnection) URI.create(request.streamUrl()).toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(agent.getConnectTimeout());
            // 流式读取不设短超时：单次模型调用可阻塞 70s，期间流上可能没有任何事件
            conn.setReadTimeout(0);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", MediaType.TEXT_EVENT_STREAM_VALUE);
            conn.setRequestProperty("Authorization", request.headers().getFirst("Authorization"));

            try (OutputStream os = conn.getOutputStream()) {
                os.write(objectMapper.writeValueAsString(request.body())
                        .getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                String errorBody = readErrorBody(conn);
                int status = responseCode;
                String code = AiUpstreamErrors.codeForStatus(status);
                String message = AiUpstreamErrors.messageForStatus(status, errorBody);
                log.error("wubi SSE proxy: upstream {} ({})", status, errorBody);
                if (accounted.compareAndSet(false, true)) {
                    miaoAiClient.recordStreamFailure(handle, code, truncate(message, 512));
                }
                sendError(emitter, mapUpstreamCode(code), message);
                emitter.complete();
                return;
            }

            EventCounter counter = forwardEvents(conn, emitter);

            /*
             * !! 没收到 done 就是上游断流，不是正常完成 !!
             *
             * 上游写出半个事件就断开时，`readLine()` 返回的是**正常 EOF**（不抛
             * IOException），`forwardEvents` 会安静地返回 —— 于是一次失败的调用
             * 看起来像成功，浏览器只收到一个空流，用户看到的是「什么都没发生」。
             * miao-ai 的契约明确：`done` 是唯一收尾事件，缺了它结果不可信。
             */
            if (!counter.sawDone()) {
                log.error("wubi SSE upstream ended without done: action={}, exec={}, token={}",
                        action, counter.execCount(), counter.tokenCount());
                if (accounted.compareAndSet(false, true)) {
                    miaoAiClient.recordStreamFailure(handle, "AI_UPSTREAM_BROKEN",
                            "上游流未以 done 事件结束");
                }
                sendError(emitter, "AI_SERVICE_UNAVAILABLE",
                        "AI 讲解连接中断了，请重试（上游未正常结束）");
                emitter.complete();
                return;
            }

            log.info("wubi SSE proxy done: action={}, exec={}, token={}",
                    action, counter.execCount(), counter.tokenCount());
            if (accounted.compareAndSet(false, true)) {
                recordSuccess(handle, counter);
            }
            emitter.complete();

        } catch (UpstreamGoneException upstreamGone) {
            /*
             * 上游断流：miao-ai 侧的问题。要**如实告知用户**并记故障 ——
             * 静默收尾会让用户以为「AI 讲完了但什么都没说」。
             */
            log.error("wubi SSE upstream stream broke: action={}, {}",
                    action, upstreamGone.getMessage());
            if (accounted.compareAndSet(false, true)) {
                miaoAiClient.recordStreamFailure(handle, "AI_UPSTREAM_BROKEN",
                        truncate(upstreamGone.getMessage(), 512));
            }
            sendError(emitter, "AI_SERVICE_UNAVAILABLE",
                    "AI 讲解连接中断了，请重试（上游断流）");
            try {
                emitter.complete();
            } catch (Exception ignored) {
                // 客户端可能也已断开
            }
        } catch (ClientGoneException gone) {
            /*
             * 客户端自己断开（关页面 / 取消请求）：**不是故障**。
             *
             * 两个不能省的理由：
             * 1. 记成 SSE_PROXY_ERROR 会让观测面板的失败率虚高 —— 用户关页面是高频操作；
             * 2. 再 sendError 是往已断开的连接写数据，必然 IOException，纯属浪费。
             * 这里只记 info 并正常收尾（转发已停止，剩下的只是记账与关闭）。
             */
            log.info("wubi SSE client gone: action={}", action);
            if (accounted.compareAndSet(false, true)) {
                miaoAiClient.recordStreamFailure(handle, "SSE_CLIENT_DISCONNECTED",
                        "客户端断开连接");
            }
            try {
                emitter.complete();
            } catch (Exception ignored) {
                // 客户端已断开，complete 失败无可补救
            }
        } catch (Exception e) {
            log.error("wubi SSE proxy error: action={}, {}", action, e.getMessage(), e);
            if (accounted.compareAndSet(false, true)) {
                miaoAiClient.recordStreamFailure(handle, "SSE_PROXY_ERROR",
                        truncate(e.getMessage(), 512));
            }
            sendError(emitter, "AI_SERVICE_UNAVAILABLE", "AI 讲解服务异常：" + e.getMessage());
            try {
                emitter.complete();
            } catch (Exception ignored) {
                // 客户端可能已断开，这里没有可做的补救
            }
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Exception ignored) {
                    // disconnect 失败不影响已转发的数据
                }
            }
        }
    }

    /** 事件计数与 done 载荷，用于可观测性记录 */
    private record EventCounter(String traceId, String doneOutput, int execCount,
                               int tokenCount, boolean sawDone) {
    }

    /**
     * 逐事件转发，并顺手统计 `exec` / `token` 数量与 `done` 载荷。
     *
     * @throws ClientGoneException 客户端断开（用于提前结束循环，不再空读上游）
     */
    private EventCounter forwardEvents(HttpURLConnection conn, SseEmitter emitter)
            throws ClientGoneException, UpstreamGoneException {
        String currentEvent = "";
        StringBuilder currentData = new StringBuilder();
        int execCount = 0;
        int tokenCount = 0;
        String traceId = null;
        String doneOutput = null;
        boolean sawDone = false;

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("event:")) {
                    currentEvent = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                    currentData.append(line.substring(5).trim());
                } else if (line.isEmpty()) {
                    if (currentData.length() > 0) {
                        String data = currentData.toString();
                        // 不设白名单：未知事件名照样转发（miao-ai 承诺只增不改）
                        try {
                            emitter.send(SseEmitter.event().name(currentEvent).data(data));
                        } catch (Exception sendEx) {
                            throw new ClientGoneException(sendEx);
                        }
                        if ("exec".equals(currentEvent)) {
                            execCount++;
                        } else if ("token".equals(currentEvent)) {
                            tokenCount++;
                        } else if ("done".equals(currentEvent)) {
                            sawDone = true;
                            traceId = readTraceId(data);
                            doneOutput = readDoneOutput(data);
                        }
                    }
                    currentEvent = "";
                    currentData.setLength(0);
                }
            }
        } catch (java.io.IOException io) {
            // 读上游失败：与「客户端断开」区分开（见 UpstreamGoneException 注释）
            throw new UpstreamGoneException(io);
        }
        return new EventCounter(traceId, doneOutput, execCount, tokenCount, sawDone);
    }

    /**
     * 往客户端写失败 = **客户端已断开**（关页面 / 取消请求）。
     *
     * 这不是故障：记成失败会让观测面板的失败率虚高，再 sendError 也是白写。
     */
    private static class ClientGoneException extends Exception {
        ClientGoneException(Throwable cause) {
            super(cause);
        }
    }

    /**
     * 读上游失败 = **上游断流**（agent 崩了 / 连接被掐）。
     *
     * 与「客户端断开」必须分开：前者是 miao-ai 侧的问题，要记故障并告知用户；
     * 后者是用户的正常操作，什么都不该做。初版把两者都塞进
     * `ClientGoneException`，导致上游断流会被静默吞掉、用户看不到任何提示。
     */
    private static class UpstreamGoneException extends Exception {
        UpstreamGoneException(Throwable cause) {
            super(cause);
        }
    }

    /** 记录本次流式调用成功（有模型名/耗时则带上，取不到不影响主流程） */
    private void recordSuccess(AiInvocationRecorder.InvocationHandle handle, EventCounter counter) {
        try {
            miaoAiClient.recordStreamSuccess(handle, null, null, counter.traceId(),
                    null, null, null, truncate(counter.doneOutput(), 512));
        } catch (Exception e) {
            log.warn("记录流式调用失败: {}", e.getMessage());
        }
    }

    /**
     * 立刻回一条 `error` 事件并结束流。
     *
     * <p>为什么用 SSE `error` 事件而不是 HTTP 4xx：浏览器 `fetch` 读到的是 200 + 事件流，
     * 前端只需要一套「读事件」的解析逻辑就能同时处理成功与业务失败，
     * 不必为「流建立前的失败」再写一条 `response.ok` 分支。
     * 错误体形状与 miao-ai 的 `error` 事件一致（`{code, message}`），前端才能统一处理。
     */
    private SseEmitter failFast(String code, String message, int status) {
        SseEmitter emitter = new SseEmitter(0L);
        try {
            sendError(emitter, code, message);
            emitter.complete();
        } catch (Exception ignored) {
            // 客户端可能已断开
        }
        log.info("wubi SSE fail-fast: code={}, status={}", code, status);
        return emitter;
    }

    /** 下发 `event: error`，载荷带业务码（前端按 code 分支做 410 重开会话等处置） */
    private void sendError(SseEmitter emitter, String code, String message) {
        try {
            emitter.send(SseEmitter.event().name("error").data(errorPayload(code, message)));
        } catch (Exception e) {
            log.warn("下发 error 事件失败: {}", e.getMessage());
        }
    }

    private String errorPayload(String code, String message) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "code", code == null ? "" : code,
                    "message", message == null ? "AI 讲解服务异常" : message));
        } catch (Exception e) {
            return "{\"code\":\"\",\"message\":\"AI 讲解服务异常\"}";
        }
    }

    /**
     * 上游错误码 → 面向用户的业务码。
     *
     * <p>**刻意复用 {@link WubiAiService#mapUpstream}**：两条路径若各写一份映射，
     * 迟早会出现「同步返回 410、流式返回别的码」这种前端无法统一分支的裂缝。
     * 这里只是把它套上 BusinessException 的壳再取码值。
     */
    private String mapUpstreamCode(String upstreamCode) {
        BusinessException mapped = wubiAiService.mapUpstream(
                new BusinessException(upstreamCode, "", 502));
        return mapped.getErrorCode();
    }

    private BusinessException mapUpstream(BusinessException e) {
        return wubiAiService.mapUpstream(e);
    }

    private String effectiveAgentName() {
        return miaoAiProperties.getEffectiveAgentName(WubiAiStreamService.AGENT_KEY);
    }

    @SuppressWarnings("unchecked")
    private String readTraceId(String data) {
        try {
            Map<String, Object> parsed = objectMapper.readValue(data, Map.class);
            Object traceId = parsed.get("trace_id");
            return traceId instanceof String s ? s : null;
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private String readDoneOutput(String data) {
        try {
            Map<String, Object> parsed = objectMapper.readValue(data, Map.class);
            Object output = parsed.get("output");
            return output == null ? data : objectMapper.writeValueAsString(output);
        } catch (Exception e) {
            return data;
        }
    }

    private String readErrorBody(HttpURLConnection conn) {
        try (BufferedReader errReader = new BufferedReader(
                new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = errReader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        } catch (Exception e) {
            return "unable to read error body";
        }
    }

    private String truncate(String text, int maxLength) {
        if (text == null) {
            return null;
        }
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }
}
