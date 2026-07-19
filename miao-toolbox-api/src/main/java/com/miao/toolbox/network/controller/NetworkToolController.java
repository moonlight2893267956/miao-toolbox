package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.NetworkToolMeta;
import com.miao.toolbox.network.service.NetworkToolService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 网络工具元数据 API。
 *
 * <p>{@code GET /api/network/tools} — 返回全部网络工具列表，供前端动态渲染。
 * 路径走现有 JWT / 签名 / 限流过滤器，并受 {@code TOOL_NETWORK_TOOLBOX} 路由权限保护。
 */
@RestController
@RequestMapping("/api/network")
@RequireRoute("TOOL_NETWORK_TOOLBOX")
@RequiredArgsConstructor
public class NetworkToolController {

    private final NetworkToolService networkToolService;

    @GetMapping("/tools")
    public ResponseEntity<ApiResponse<List<NetworkToolMeta>>> listTools() {
        return ResponseEntity.ok(ApiResponse.success(networkToolService.listTools()));
    }
}
