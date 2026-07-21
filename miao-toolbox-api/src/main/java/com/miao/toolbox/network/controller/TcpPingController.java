package com.miao.toolbox.network.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.TcpPingRequest;
import com.miao.toolbox.network.dto.TcpPingResponse;
import com.miao.toolbox.network.service.TcpPingService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * TCP Ping API。
 * <ul>
 *   <li>{@code POST /api/network/inspector/tcp-ping} — 批量探测，一次返回</li>
 *   <li>{@code POST /api/network/inspector/tcp-ping/stream} — SSE 逐次推送（连续检测）</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/tcp-ping")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class TcpPingController {

    private final TcpPingService tcpPingService;
    private final ObjectMapper objectMapper;
    private final ExecutorService streamExecutor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "tcp-ping-stream");
        t.setDaemon(true);
        return t;
    });

    @PostMapping
    public ResponseEntity<ApiResponse<TcpPingResponse>> ping(@Valid @RequestBody TcpPingRequest request) {
        normalize(request);
        TcpPingResponse result = tcpPingService.ping(request);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody TcpPingRequest request, HttpServletResponse response) {
        normalize(request);
        // 连续模式默认拉满 30 次（若未显式指定）
        if (request.getCount() == null || request.getCount() < 1) {
            request.setCount(30);
        }
        long timeoutMs = Math.max(60_000L, request.getCount() * 8_000L);
        // 关闭代理缓冲，确保 SSE 逐条实时推送到浏览器（兜底，配合 nginx proxy_buffering off）
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        SseEmitter emitter = new SseEmitter(timeoutMs);

        streamExecutor.execute(() -> {
            boolean[] clientGone = {false};
            try {
                TcpPingResponse summary = tcpPingService.pingStreaming(request, probe -> {
                    if (clientGone[0]) {
                        return;
                    }
                    try {
                        emitter.send(SseEmitter.event()
                                .name("probe")
                                .data(objectMapper.writeValueAsString(probe)));
                    } catch (IOException e) {
                        // 客户端已断开（如手动停止、刷新页面），静默终止推送
                        clientGone[0] = true;
                        throw new ClientGoneException();
                    }
                });
                if (!clientGone[0]) {
                    emitter.send(SseEmitter.event()
                            .name("summary")
                            .data(objectMapper.writeValueAsString(summary)));
                    emitter.send(SseEmitter.event().name("done").data("{}"));
                }
                safeComplete(emitter);
            } catch (ClientGoneException ignored) {
                // 客户端已断开，安静结束，不记录异常堆栈
                safeComplete(emitter);
            } catch (Exception e) {
                log.warn("tcp-ping stream failed: {}", e.getMessage());
                if (!clientGone[0]) {
                    try {
                        emitter.send(SseEmitter.event()
                                .name("error")
                                .data("{\"message\":\"" + escape(e.getMessage()) + "\"}"));
                    } catch (IOException ignored) {
                        // ignore
                    }
                }
                safeCompleteWithError(emitter, e);
            }
        });

        return emitter;
    }

    /** 客户端断开时抛出的内部标记异常，用于中断流式循环。 */
    private static final class ClientGoneException extends RuntimeException {
    }

    private static void safeComplete(SseEmitter emitter) {
        try {
            emitter.complete();
        } catch (Throwable ignored) {
            // 客户端可能已断开，忽略
        }
    }

    private static void safeCompleteWithError(SseEmitter emitter, Throwable e) {
        try {
            emitter.completeWithError(e);
        } catch (Throwable ignored) {
            // 客户端可能已断开，忽略
        }
    }

    private static void normalize(TcpPingRequest request) {
        if (request.getPort() == null) {
            request.setPort(443);
        }
        if (request.getCount() == null) {
            request.setCount(4);
        }
    }

    private static String escape(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
