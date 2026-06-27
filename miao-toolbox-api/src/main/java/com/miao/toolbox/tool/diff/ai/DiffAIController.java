package com.miao.toolbox.tool.diff.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.MiaoAiClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * AI 差异分析 Controller — 提供全局摘要和选中解释两个端点。
 *
 * 全局摘要使用 SSE 流式输出（AI 生成耗时较长），
 * 选中解释使用同步调用（耗时较短）。
 *
 * SSE 转发方式：直接用 SseEmitter 逐事件转发 miao-ai 的 SSE 流，
 * 保持 event/data 格式与 miao-ai 原始输出一致。
 *
 * 调用日志：
 *   - 同步调用(explain)：由 MiaoAiClient 自动记录
 *   - SSE 流式调用(summary)：在 done 事件时记录成功，在 error/断开时记录失败
 *
 * 关键：SseEmitter 异步回写时，Tomcat 会重新走 FilterChain，
 * SecurityContextHolder 是 ThreadLocal 的，异步线程无认证 → Access Denied。
 * 修复：在返回 SseEmitter 前捕获 SecurityContext，在异步线程中设置。
 */
@Slf4j
@RestController
@RequestMapping("/api/diff/ai")
@RequiredArgsConstructor
public class DiffAIController {

    private final AIAnalysisService aiAnalysisService;
    private final MiaoAiProperties miaoAiProperties;
    private final MiaoAiClient miaoAiClient;

    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * POST /api/diff/ai/summary — 全局变更摘要（SSE 流式输出）
     *
     * 前端通过 fetch(ReadableStream) 消费 SSE 事件。
     * 事件格式与 miao-ai 一致：
     *   event: token\ndata: {"token": "..."}\n\n
     *   event: done\ndata: {"trace_id": "...", "latency_ms": ...}\n\n
     *   event: error\ndata: {"message": "..."}\n\n
     */
    @PostMapping(value = "/summary", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter summary(@RequestBody AIAnalysisRequest request) {
        if (!miaoAiProperties.isEnabled()) {
            SseEmitter emitter = new SseEmitter(0L);
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"AI 分析功能未启用\"}"));
                emitter.complete();
            } catch (Exception ignored) {}
            return emitter;
        }

        // 强制设置 summary 模式
        request.setMode("summary");

        // ★★★ 关键：捕获当前线程（Servlet 线程）的 SecurityContext ★★★
        SecurityContext securityContext = SecurityContextHolder.getContext();

        // 3 分钟超时（大 diff + 慢模型可能很慢）
        SseEmitter emitter = new SseEmitter(180_000L);

        // ★★★ 在 Servlet 线程（有认证信息）中记录调用开始 ★★★
        Map<String, Object> input = aiAnalysisService.buildInput(request);
        String requestSummary = safeToJson(input);
        AiInvocationRecorder.InvocationHandle handle =
                miaoAiClient.recordStreamStart(miaoAiProperties.getAgentName(), requestSummary);

        sseExecutor.execute(() -> {
            // ★★★ 在异步线程中设置 SecurityContext，防止 async dispatch 时 Access Denied ★★★
            SecurityContextHolder.setContext(securityContext);
            try {
                doProxyStream(request, emitter, handle);
            } finally {
                // 清理，避免线程池复用时泄漏
                SecurityContextHolder.clearContext();
            }
        });

        emitter.onTimeout(() -> {
            log.warn("SSE emitter timeout for summary");
            miaoAiClient.recordStreamFailure(handle, "SSE_TIMEOUT", "SSE 连接超时");
        });
        emitter.onError(ex -> {
            log.warn("SSE emitter error: {}", ex.getMessage());
            miaoAiClient.recordStreamFailure(handle, "SSE_ERROR", ex.getMessage());
        });

        return emitter;
    }

    /**
     * POST /api/diff/ai/explain — 选中差异解释（同步调用）
     * MiaoAiClient 自动记录调用日志，无需额外处理。
     */
    @PostMapping("/explain")
    public ResponseEntity<ApiResponse<AIAnalysisResponse>> explain(@RequestBody AIAnalysisRequest request) {
        // 强制设置 explain_selection 模式
        request.setMode("explain_selection");
        AIAnalysisResponse response = aiAnalysisService.analyze(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * SSE 流代理核心逻辑：从 miao-ai 读取 SSE 事件，逐个转发给前端。
     * 在 done 事件时记录调用成功，在 error/断开时记录调用失败。
     */
    private void doProxyStream(AIAnalysisRequest request, SseEmitter emitter,
                                AiInvocationRecorder.InvocationHandle handle) {
        HttpURLConnection conn = null;
        try {
            String streamUrl = aiAnalysisService.getStreamUrl();
            HttpHeaders headers = aiAnalysisService.getStreamHeaders();
            Map<String, Object> body = aiAnalysisService.buildInvokeBody(request);

            log.info("SSE proxy: connecting to miao-ai at {}", streamUrl);

            // 建立 HTTP 长连接
            URI uri = URI.create(streamUrl);
            conn = (HttpURLConnection) uri.toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(miaoAiProperties.getConnectTimeout());
            // SSE 是长连接，readTimeout 必须设为 0（无限），否则中途超时断开
            conn.setReadTimeout(0);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", headers.getFirst("Authorization"));
            conn.setRequestProperty("Accept", "text/event-stream");

            // 发送请求体
            try (OutputStream os = conn.getOutputStream()) {
                String jsonBody = objectMapper.writeValueAsString(body);
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            log.info("SSE proxy: miao-ai responded HTTP {}", responseCode);

            if (responseCode != 200) {
                String errorBody = readErrorBody(conn);
                log.error("SSE proxy: miao-ai error (HTTP {}): {}", responseCode, errorBody);
                miaoAiClient.recordStreamFailure(handle, "AI_HTTP_" + responseCode,
                        "miao-ai 返回错误: " + responseCode);
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"miao-ai 返回错误: " + responseCode + "\"}"));
                emitter.complete();
                return;
            }

            // 逐行读取 miao-ai 的 SSE 事件并逐个转发给前端
            int tokenCount = 0;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {

                String line;
                String currentEvent = "message";
                StringBuilder currentData = new StringBuilder();

                while ((line = reader.readLine()) != null) {
                    // SSE 协议解析
                    if (line.startsWith("event:")) {
                        currentEvent = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        currentData.append(line.substring(5).trim());
                    } else if (line.isEmpty()) {
                        // 空行 = 事件分隔符，发送当前累积的事件
                        if (currentData.length() > 0) {
                            try {
                                emitter.send(SseEmitter.event()
                                        .name(currentEvent)
                                        .data(currentData.toString()));

                                // ★★★ done 事件：记录调用成功 ★★★
                                if ("done".equals(currentEvent)) {
                                    recordDoneEvent(handle, currentData.toString());
                                }

                                if ("token".equals(currentEvent)) {
                                    tokenCount++;
                                }
                            } catch (Exception sendEx) {
                                log.warn("SSE proxy: failed to send event to client: {}", sendEx.getMessage());
                                miaoAiClient.recordStreamFailure(handle, "SSE_CLIENT_DISCONNECTED",
                                        "客户端断开连接");
                                break;
                            }
                        }
                        // 重置当前事件
                        currentEvent = "message";
                        currentData.setLength(0);
                    }
                    // 忽略 : 开头的注释行和其他行
                }
            }

            log.info("SSE proxy: stream completed, forwarded {} token events", tokenCount);
            emitter.complete();

        } catch (Exception e) {
            log.error("SSE proxy error: {}", e.getMessage(), e);
            miaoAiClient.recordStreamFailure(handle, "SSE_PROXY_ERROR",
                    truncate(e.getMessage(), 512));
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"AI 分析服务异常: " + e.getMessage() + "\"}"));
            } catch (Exception ignored) {}
            try {
                emitter.completeWithError(e);
            } catch (Exception ignored) {}
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    /**
     * 解析 done 事件数据，提取 model/traceId/tokens 等信息并记录成功。
     */
    private void recordDoneEvent(AiInvocationRecorder.InvocationHandle handle, String dataJson) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> doneData = objectMapper.readValue(dataJson, Map.class);

            String model = (String) doneData.get("model");
            String mode = (String) doneData.get("mode");
            String traceId = (String) doneData.get("trace_id");

            // 解析 usage（可能缺失）
            Integer promptTokens = null;
            Integer completionTokens = null;
            Integer totalTokens = null;
            @SuppressWarnings("unchecked")
            Map<String, Object> usage = (Map<String, Object>) doneData.get("usage");
            if (usage != null) {
                promptTokens = usage.get("prompt_tokens") instanceof Number n ? n.intValue() : null;
                completionTokens = usage.get("completion_tokens") instanceof Number n ? n.intValue() : null;
                totalTokens = usage.get("total_tokens") instanceof Number n ? n.intValue() : null;
            }

            miaoAiClient.recordStreamSuccess(handle, model, mode, traceId,
                    promptTokens, completionTokens, totalTokens,
                    truncate(String.valueOf(doneData.get("analysis")), 512));

        } catch (Exception e) {
            // done 事件解析失败不应阻塞流，仍然记录成功但不含详细字段
            log.warn("Failed to parse SSE done event for recording: {}", e.getMessage());
            miaoAiClient.recordStreamSuccess(handle, null, null, null,
                    null, null, null, "done_event_parse_failed");
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
        if (text == null) return null;
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }

    private String safeToJson(Object obj) {
        try {
            return truncate(objectMapper.writeValueAsString(obj), 512);
        } catch (Exception e) {
            return truncate(String.valueOf(obj), 512);
        }
    }
}
