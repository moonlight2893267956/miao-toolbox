package com.miao.toolbox.tool.diff.ai;

import com.miao.toolbox.common.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintWriter;
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
 */
@Slf4j
@RestController
@RequestMapping("/api/diff/ai")
@RequiredArgsConstructor
public class DiffAIController {

    private final AIAnalysisService aiAnalysisService;
    private final MiaoAiProperties miaoAiProperties;

    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();

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

        // 3 分钟超时（大 diff + 慢模型可能很慢）
        SseEmitter emitter = new SseEmitter(180_000L);

        sseExecutor.execute(() -> {
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
                    String jsonBody = new com.fasterxml.jackson.databind.ObjectMapper()
                            .writeValueAsString(body);
                    os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }

                int responseCode = conn.getResponseCode();
                log.info("SSE proxy: miao-ai responded HTTP {}", responseCode);

                if (responseCode != 200) {
                    String errorBody = readErrorBody(conn);
                    log.error("SSE proxy: miao-ai error (HTTP {}): {}", responseCode, errorBody);
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
                            // data 行可能多行拼接，但 miao-ai 每个 event 只有一行 data
                            currentData.append(line.substring(5).trim());
                        } else if (line.isEmpty()) {
                            // 空行 = 事件分隔符，发送当前累积的事件
                            if (currentData.length() > 0) {
                                try {
                                    emitter.send(SseEmitter.event()
                                            .name(currentEvent)
                                            .data(currentData.toString()));
                                    if ("token".equals(currentEvent)) {
                                        tokenCount++;
                                    }
                                } catch (Exception sendEx) {
                                    // 前端可能已经断开（页面跳转/取消）
                                    log.warn("SSE proxy: failed to send event to client: {}", sendEx.getMessage());
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
        });

        emitter.onTimeout(() -> log.warn("SSE emitter timeout for summary"));
        emitter.onError(ex -> log.warn("SSE emitter error: {}", ex.getMessage()));

        return emitter;
    }

    /**
     * POST /api/diff/ai/explain — 选中差异解释（同步调用）
     */
    @PostMapping("/explain")
    public ResponseEntity<ApiResponse<AIAnalysisResponse>> explain(@RequestBody AIAnalysisRequest request) {
        // 强制设置 explain_selection 模式
        request.setMode("explain_selection");
        AIAnalysisResponse response = aiAnalysisService.analyze(request);
        return ResponseEntity.ok(ApiResponse.success(response));
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
}
