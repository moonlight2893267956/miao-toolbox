package com.miao.toolbox.network.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.GraphqlProxyRequest;
import com.miao.toolbox.network.dto.GraphqlProxyResult;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * GraphQL 查询代理：构造标准 GraphQL 请求体（query/operationName/variables），
 * 经 SSRF 安全的 {@link HttpFetcher#fetchWithBody} 以 POST 转发至目标端点，
 * 透传状态码、响应头与响应体。Variables 必须是合法 JSON，否则返回 400。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GraphqlProxyService {

    private final HttpFetcher httpFetcher;
    private final ObjectMapper objectMapper;

    public GraphqlProxyResult proxy(GraphqlProxyRequest req) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("query", req.getQuery());
        if (req.getOperationName() != null && !req.getOperationName().isBlank()) {
            payload.put("operationName", req.getOperationName());
        }
        if (req.getVariables() != null && !req.getVariables().isBlank()) {
            Object vars;
            try {
                vars = objectMapper.readValue(req.getVariables(), Object.class);
            } catch (JsonProcessingException e) {
                throw new BusinessException("GRAPHQL_INVALID_VARIABLES", "Variables 不是合法 JSON", 400);
            }
            payload.put("variables", vars);
        }
        String body;
        try {
            body = objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new BusinessException("GRAPHQL_BUILD_FAILED", "构造请求体失败", 500);
        }
        // SSRF / DNS / 网络异常由 HttpFetcher 上抛，交由全局异常处理器统一响应
        HttpFetcher.HttpFetchResult r = httpFetcher.fetchWithBody(req.getEndpoint(), "POST", req.getHeaders(), body, 0);
        GraphqlProxyResult res = new GraphqlProxyResult();
        res.setStatusCode(r.statusCode());
        res.setHeaders(r.headers());
        res.setBody(r.body());
        res.setElapsedMs(r.elapsedMs());
        return res;
    }
}
