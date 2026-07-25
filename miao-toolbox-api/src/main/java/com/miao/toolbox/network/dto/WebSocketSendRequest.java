package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * WebSocket 发送消息请求。
 */
public class WebSocketSendRequest {

    @NotBlank(message = "会话 ID 不能为空")
    private String sessionId;

    @NotBlank(message = "消息不能为空")
    private String message;

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
