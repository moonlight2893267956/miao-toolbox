package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.GraphqlProxyRequest;
import com.miao.toolbox.network.dto.GraphqlProxyResult;
import com.miao.toolbox.network.service.GraphqlProxyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * GraphQL 查询测试器接口。
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/graphql")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class GraphqlProxyController {

    private final GraphqlProxyService graphqlProxyService;

    @PostMapping("/proxy")
    public ResponseEntity<ApiResponse<GraphqlProxyResult>> proxy(
            @Valid @RequestBody GraphqlProxyRequest request) {
        return ResponseEntity.ok(ApiResponse.success(graphqlProxyService.proxy(request)));
    }
}
