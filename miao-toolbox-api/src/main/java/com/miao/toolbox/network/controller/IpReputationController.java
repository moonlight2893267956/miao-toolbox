package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.IpReputationRequest;
import com.miao.toolbox.network.dto.IpReputationResponse;
import com.miao.toolbox.network.service.IpReputationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * IP 信誉检查接口。
 */
@Slf4j
@RestController
@RequestMapping("/api/network/inspector/ip-reputation")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class IpReputationController {

    private final IpReputationService ipReputationService;

    @PostMapping
    public ResponseEntity<ApiResponse<IpReputationResponse>> check(
        @Valid @RequestBody IpReputationRequest request
    ) {
        return ResponseEntity.ok(ApiResponse.success(ipReputationService.check(request)));
    }
}
