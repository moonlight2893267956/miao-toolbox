package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.WhoisQueryRequest;
import com.miao.toolbox.network.dto.WhoisQueryResponse;
import com.miao.toolbox.network.service.WhoisQueryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * WHOIS 查询 API。
 * <ul>
 *   <li>{@code POST /api/network/inspector/whois} — 查询域名 / IP 的 WHOIS 信息</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/whois")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class WhoisQueryController {

    private final WhoisQueryService whoisQueryService;

    @PostMapping
    public ResponseEntity<ApiResponse<WhoisQueryResponse>> query(@Valid @RequestBody WhoisQueryRequest request) {
        WhoisQueryResponse result = whoisQueryService.query(request);
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
