package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

/**
 * GraphQL 代理请求：端点 URL + 查询语句 + 可选 operationName/Variables/Headers。
 */
public class GraphqlProxyRequest {

    @NotBlank(message = "端点 URL 不能为空")
    private String endpoint;

    @NotBlank(message = "查询语句不能为空")
    private String query;

    private String operationName;

    /** Variables JSON 字符串（如 {"id":"1"}），可为空。 */
    private String variables;

    /** 自定义 HTTP Header（键值对），可为空。 */
    private Map<String, String> headers;

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public String getOperationName() {
        return operationName;
    }

    public void setOperationName(String operationName) {
        this.operationName = operationName;
    }

    public String getVariables() {
        return variables;
    }

    public void setVariables(String variables) {
        this.variables = variables;
    }

    public Map<String, String> getHeaders() {
        return headers;
    }

    public void setHeaders(Map<String, String> headers) {
        this.headers = headers;
    }
}
