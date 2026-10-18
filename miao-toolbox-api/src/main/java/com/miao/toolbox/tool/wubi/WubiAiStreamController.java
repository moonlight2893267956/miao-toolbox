package com.miao.toolbox.tool.wubi;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.AiStreamProxy;
import com.miao.toolbox.observability.AiUpstreamErrors;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.util.Map;

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
    /** 流式转发唯一实现：连接建立、事件解析、失败归因、记账幂等都在它那里 */
    private final AiStreamProxy aiStreamProxy;

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

    private final ObjectMapper objectMapper = new ObjectMapper();


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
    /**
     * 转发请求：交给 {@link AiStreamProxy}（全仓库唯一实现）。
     *
     * <p>本方法此前自带线程池、记账、超时回调与 SSE 解析循环，与 cron / regex /
     * diff 三个工具逐行重复。现只保留五笔特有的部分：错误码映射（要与同步路径
     * 同一份，否则会出现「同步返 410、流式返别的码」这种前端无法统一分支的裂缝）
     * 与收尾时的结构化 output 记账。
     *
     * <p>事件名<b>不设白名单</b>：miao-ai 的执行事件契约明确承诺「事件名只增不改」，
     * 一旦加白名单，平台新增事件类型时会被静默丢弃，线上只表现为「过程轨少了几步」。
     * 该契约由 miao-ai 侧 {@code backend/tests/test_invoke_exec_passthrough.py} 钉死。
     */
    private SseEmitter proxy(WubiAiStreamService.StreamRequest request, String action) {
        return aiStreamProxy.proxy(
                // body 已由 WubiAiStreamService 组装完整（含 input 与 metadata），
                // 且首轮要先建会话才能定稿 —— 不能让代理层再拼一次
                AiStreamProxy.Request.ofPrebuilt(
                        WubiAiStreamService.AGENT_KEY, request.body(), action, EMITTER_TIMEOUT_MS),
                new AiStreamProxy.Observer() {
                    @Override
                    public String serviceLabel() {
                        // 五笔这边确实叫「讲解」：右侧面板就叫 AI 讲解台
                        return "AI 讲解";
                    }

                    @Override
                    public void recordSuccess(AiStreamProxy.StreamStats stats,
                                              AiInvocationRecorder.InvocationHandle handle) {
                        // 显式限定：同名方法在匿名类里会解析到自身，漏掉这点会无限递归
                        WubiAiStreamController.this.recordSuccess(handle, stats);
                    }

                    /**
                     * 上游状态码 → 面向前端的业务码。
                     *
                     * <p>刻意复用 {@link WubiAiService#mapUpstream}：两条路径若各写一份映射，
                     * 迟早出现「同步返回 410、流式返回别的码」这种前端无法统一分支的裂缝
                     * —— 前端正是按 code 分支做 410 自动重开会话的。
                     */
                    @Override
                    public String mapClientErrorCode(String upstreamCode) {
                        return wubiAiService.mapUpstream(
                                new BusinessException(upstreamCode, "", 502)).getErrorCode();
                    }
                });
    }

    /** 事件计数与 done 载荷，用于可观测性记录 */
    private record EventCounter(String traceId, String doneOutput, int execCount,
                               int tokenCount, boolean sawDone) {
        }

    /** 记录本次流式调用成功（有模型名/耗时则带上，取不到不影响主流程） */
    private void recordSuccess(AiInvocationRecorder.InvocationHandle handle,
                               AiStreamProxy.StreamStats stats) {
        try {
            miaoAiClient.recordStreamSuccess(handle, null, null,
                    readTraceId(stats.doneData()),
                    null, null, null, readDoneOutput(stats.doneData()));
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


    private String truncate(String text, int maxLength) {
        if (text == null) {
            return null;
        }
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }
}
