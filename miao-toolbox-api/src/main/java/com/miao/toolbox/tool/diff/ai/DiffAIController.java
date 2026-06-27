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
     * 前端通过 EventSource 或 fetch(ReadableStream) 消费 SSE 事件。
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

        SseEmitter emitter = new SseEmitter(120_000L); // 2 分钟超时

        sseExecutor.execute(() -> {
            try {
                String streamUrl = aiAnalysisService.getStreamUrl();
                HttpHeaders headers = aiAnalysisService.getStreamHeaders();
                Map<String, Object> body = aiAnalysisService.buildInvokeBody(request);

                // 直接 HTTP 连接做 SSE 代理转发
                URI uri = URI.create(streamUrl);
                HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setConnectTimeout(miaoAiProperties.getConnectTimeout());
                conn.setReadTimeout(miaoAiProperties.getReadTimeout());
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", headers.getFirst("Authorization"));
                conn.setRequestProperty("Accept", "text/event-stream");

                // 发送请求体
                try (OutputStream os = conn.getOutputStream()) {
                    String jsonBody = new com.fasterxml.jackson.databind.ObjectMapper()
                            .writeValueAsString(body);
                    os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                }

                int responseCode = conn.getResponseCode();
                if (responseCode != 200) {
                    emitter.send(SseEmitter.event()
                            .name("error")
                            .data("{\"message\":\"miao-ai 返回错误: " + responseCode + "\"}"));
                    emitter.complete();
                    return;
                }

                // 逐行读取 SSE 事件并转发
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    StringBuilder eventData = new StringBuilder();
                    String eventName = "message";

                    while ((line = reader.readLine()) != null) {
                        if (line.startsWith("event: ")) {
                            eventName = line.substring(7).trim();
                        } else if (line.startsWith("data: ")) {
                            eventData.append(line.substring(6));
                        } else if (line.isEmpty() && eventData.length() > 0) {
                            // 空行表示事件结束，转发给前端
                            emitter.send(SseEmitter.event()
                                    .name(eventName)
                                    .data(eventData.toString()));
                            eventData.setLength(0);
                            eventName = "message";
                        }
                    }
                }

                emitter.complete();

            } catch (Exception e) {
                log.error("SSE proxy error: {}", e.getMessage());
                try {
                    emitter.send(SseEmitter.event()
                            .name("error")
                            .data("{\"message\":\"AI 分析服务异常: " + e.getMessage() + "\"}"));
                } catch (Exception ignored) {}
                emitter.completeWithError(e);
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
}
