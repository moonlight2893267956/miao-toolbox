package com.miao.toolbox.network.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.DnsQueryRequest;
import com.miao.toolbox.network.dto.DnsQueryResponse;
import com.miao.toolbox.network.service.DnsQueryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * DNS 查询 API。
 * <ul>
 *   <li>{@code POST /api/network/inspector/dns-query} — 查询域名的多种 DNS 记录</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/dns-query")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class DnsQueryController {

    private final DnsQueryService dnsQueryService;
    private final ObjectMapper objectMapper;

    @PostMapping
    public ResponseEntity<ApiResponse<DnsQueryResponse>> query(@Valid @RequestBody DnsQueryRequest request) {
        DnsQueryResponse result = dnsQueryService.query(request);
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
