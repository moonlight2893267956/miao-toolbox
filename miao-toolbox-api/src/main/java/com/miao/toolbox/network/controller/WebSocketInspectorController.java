package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.WebSocketConnectRequest;
import com.miao.toolbox.network.dto.WebSocketDisconnectRequest;
import com.miao.toolbox.network.dto.WebSocketSendRequest;
import com.miao.toolbox.network.service.WebSocketTesterService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * WebSocket 测试器接口。
 *
 * <ul>
 *   <li>{@code POST /api/network/inspector/websocket/connect} — 建立到目标的 WS 连接，返回 sessionId</li>
 *   <li>{@code GET  /api/network/inspector/websocket/{sessionId}/stream} — SSE 实时事件流</li>
 *   <li>{@code POST /api/network/inspector/websocket/send} — 通过该会话发送文本消息</li>
 *   <li>{@code POST /api/network/inspector/websocket/disconnect} — 主动断开</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/websocket")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class WebSocketInspectorController {

    private final WebSocketTesterService webSocketTesterService;

    @PostMapping("/connect")
    public ResponseEntity<ApiResponse<Map<String, String>>> connect(
            @Valid @RequestBody WebSocketConnectRequest request) {
        String sessionId = webSocketTesterService.connect(request);
        return ResponseEntity.ok(ApiResponse.success(Map.of("sessionId", sessionId)));
    }

    @GetMapping(value = "/{sessionId}/stream", produces = "text/event-stream")
    public SseEmitter stream(@PathVariable String sessionId, HttpServletResponse response) {
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        return webSocketTesterService.subscribe(sessionId);
    }

    @PostMapping("/send")
    public ResponseEntity<ApiResponse<Void>> send(@Valid @RequestBody WebSocketSendRequest request) {
        webSocketTesterService.send(request);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/disconnect")
    public ResponseEntity<ApiResponse<Void>> disconnect(@Valid @RequestBody WebSocketDisconnectRequest request) {
        webSocketTesterService.disconnect(request);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
