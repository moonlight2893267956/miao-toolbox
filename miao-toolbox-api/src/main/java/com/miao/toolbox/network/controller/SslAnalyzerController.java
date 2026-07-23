package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.SslAnalyzerRequest;
import com.miao.toolbox.network.dto.SslAnalyzerResponse;
import com.miao.toolbox.network.service.SslAnalyzerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * SSL/TLS 证书分析接口。
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/ssl-analyzer")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class SslAnalyzerController {

    private final SslAnalyzerService sslAnalyzerService;

    @PostMapping
    public ResponseEntity<ApiResponse<SslAnalyzerResponse>> analyze(
            @Valid @RequestBody SslAnalyzerRequest request) {
        return ResponseEntity.ok(ApiResponse.success(sslAnalyzerService.analyze(request)));
    }
}
