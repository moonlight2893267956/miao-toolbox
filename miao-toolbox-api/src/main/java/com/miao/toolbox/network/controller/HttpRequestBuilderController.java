package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.HttpRequestBuilderRequest;
import com.miao.toolbox.network.dto.HttpRequestBuilderResponse;
import com.miao.toolbox.network.service.HttpRequestBuilderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP 请求构建器接口（服务端代理发请求）。
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/http-request-builder")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class HttpRequestBuilderController {

    private final HttpRequestBuilderService httpRequestBuilderService;

    @PostMapping
    public ResponseEntity<ApiResponse<HttpRequestBuilderResponse>> build(
        @Valid @RequestBody HttpRequestBuilderRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(httpRequestBuilderService.execute(request)));
    }
}
