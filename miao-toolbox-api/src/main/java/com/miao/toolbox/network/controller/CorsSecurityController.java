package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.CorsCheckRequest;
import com.miao.toolbox.network.dto.CorsCheckResult;
import com.miao.toolbox.network.dto.SecurityHeaderCheckRequest;
import com.miao.toolbox.network.dto.SecurityHeaderCheckResponse;
import com.miao.toolbox.network.service.CorsCheckService;
import com.miao.toolbox.network.service.SecurityHeaderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * CORS 策略检查器与安全头检查器接口。
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/cors-security")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class CorsSecurityController {

    private final CorsCheckService corsCheckService;
    private final SecurityHeaderService securityHeaderService;

    @PostMapping("/cors")
    public ResponseEntity<ApiResponse<CorsCheckResult>> checkCors(
            @Valid @RequestBody CorsCheckRequest request) {
        return ResponseEntity.ok(ApiResponse.success(corsCheckService.check(request)));
    }

    @PostMapping("/security-header")
    public ResponseEntity<ApiResponse<SecurityHeaderCheckResponse>> checkSecurityHeader(
            @Valid @RequestBody SecurityHeaderCheckRequest request) {
        return ResponseEntity.ok(ApiResponse.success(securityHeaderService.check(request)));
    }
}
