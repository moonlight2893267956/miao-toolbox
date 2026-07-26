package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.network.dto.PortScanRequest;
import com.miao.toolbox.network.dto.PortScanResponse;
import com.miao.toolbox.network.dto.PortScanResponse.PortScanProbe;
import com.miao.toolbox.network.service.PortScanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@RestController
@RequestMapping("/api/network/inspector/port-scan")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class PortScanController {

    private final PortScanService portScanService;

    /** 一次性返回全部结果 */
    @PostMapping
    public PortScanResponse scan(@Valid @RequestBody PortScanRequest request) {
        return portScanService.scan(request);
    }

    /** SSE 流式推送，每完成一个端口推送一次 probe，最后推送 summary + done */
    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter scanStream(@Valid @RequestBody PortScanRequest request) {
        SseEmitter emitter = new SseEmitter(300_000L); // 5 分钟超时
        emitter.onCompletion(() -> log.debug("SSE completed for port-scan {}", request.getHost()));
        emitter.onTimeout(() -> emitter.complete());

        ExecutorService executor = Executors.newSingleThreadExecutor();
        emitter.onCompletion(executor::shutdownNow);
        emitter.onTimeout(executor::shutdownNow);
        emitter.onError(e -> executor.shutdownNow());

        executor.execute(() -> {
            try {
                PortScanResponse resp = portScanService.scanStreaming(request, probe -> {
                    try {
                        emitter.send(SseEmitter.event()
                                .name("probe")
                                .data(probe, MediaType.APPLICATION_JSON));
                    } catch (IOException e) {
                        throw new ClientGoneException(e);
                    }
                });
                // summary
                emitter.send(SseEmitter.event()
                        .name("summary")
                        .data(resp, MediaType.APPLICATION_JSON));
                emitter.send(SseEmitter.event().name("done").data(""));
                emitter.complete();
            } catch (ClientGoneException e) {
                log.debug("Client disconnected during port-scan stream");
                emitter.complete();
            } catch (Exception e) {
                log.error("Port scan stream error", e);
                try {
                    emitter.send(SseEmitter.event()
                            .name("error")
                            .data("{\"message\":\"" + e.getMessage() + "\"}"));
                } catch (IOException ignored) {}
                emitter.completeWithError(e);
            } finally {
                executor.shutdownNow();
            }
        });

        return emitter;
    }

    /** 客户端断开时中断扫描 */
    private static class ClientGoneException extends RuntimeException {
        ClientGoneException(Throwable cause) { super(cause); }
    }
}
