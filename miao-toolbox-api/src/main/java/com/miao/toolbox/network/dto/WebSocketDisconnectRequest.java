package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * WebSocket 断开请求（仅携带会话 ID）。
 */
public class WebSocketDisconnectRequest {

    @NotBlank(message = "会话 ID 不能为空")
    private String sessionId;

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }
}
