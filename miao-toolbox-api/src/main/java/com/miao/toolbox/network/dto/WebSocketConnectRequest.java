package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

/**
 * WebSocket 连接请求：目标 ws/wss URL + 可选子协议与自定义握手头。
 */
public class WebSocketConnectRequest {

    @NotBlank(message = "URL 不能为空")
    private String url;

    /** 子协议，逗号分隔（如 graphql-transport-ws,graphql-ws）。 */
    private String subprotocols;

    /** 自定义握手请求头（键值对）。 */
    private Map<String, String> headers;

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getSubprotocols() {
        return subprotocols;
    }

    public void setSubprotocols(String subprotocols) {
        this.subprotocols = subprotocols;
    }

    public Map<String, String> getHeaders() {
        return headers;
    }

    public void setHeaders(Map<String, String> headers) {
        this.headers = headers;
    }
}
