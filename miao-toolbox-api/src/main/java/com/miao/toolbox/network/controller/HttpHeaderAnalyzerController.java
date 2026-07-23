package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.HttpHeaderAnalyzerRequest;
import com.miao.toolbox.network.dto.HttpHeaderAnalyzerResponse;
import com.miao.toolbox.network.service.HttpHeaderAnalyzerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP Header 分析接口。
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/http-header")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class HttpHeaderAnalyzerController {

    private final HttpHeaderAnalyzerService httpHeaderAnalyzerService;

    @PostMapping
    public ResponseEntity<ApiResponse<HttpHeaderAnalyzerResponse>> analyze(
        @Valid @RequestBody HttpHeaderAnalyzerRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(httpHeaderAnalyzerService.analyze(request)));
    }
}
