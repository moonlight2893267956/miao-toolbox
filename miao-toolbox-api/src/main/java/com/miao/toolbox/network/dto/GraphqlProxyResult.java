package com.miao.toolbox.network.dto;

import java.util.Map;

/**
 * GraphQL 代理结果：透传目标状态码、响应头与响应体（JSON）。
 */
public class GraphqlProxyResult {

    private int statusCode;
    private Map<String, String> headers;
    private String body;
    private long elapsedMs;

    public int getStatusCode() {
        return statusCode;
    }

    public void setStatusCode(int statusCode) {
        this.statusCode = statusCode;
    }

    public Map<String, String> getHeaders() {
        return headers;
    }

    public void setHeaders(Map<String, String> headers) {
        this.headers = headers;
    }

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body;
    }

    public long getElapsedMs() {
        return elapsedMs;
    }

    public void setElapsedMs(long elapsedMs) {
        this.elapsedMs = elapsedMs;
    }
}
