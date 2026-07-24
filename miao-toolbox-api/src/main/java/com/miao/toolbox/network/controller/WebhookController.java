package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.WebhookCreateResponse;
import com.miao.toolbox.network.dto.WebhookCustomResponse;
import com.miao.toolbox.network.dto.WebhookHistoryItem;
import com.miao.toolbox.network.dto.WebhookInfo;
import com.miao.toolbox.network.service.WebhookMeta;
import com.miao.toolbox.network.service.WebhookService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.time.Duration;

/**
 * Webhook 测试接收器 API。
 *
 * <ul>
 *   <li>{@code POST /api/network/webhook/create} — 登录用户创建临时端点（TTL 24h）</li>
 *   <li>{@code POST /api/network/webhook/{hookId}} — <b>公开</b>接收第三方回调（豁免网关签名/限流）</li>
 *   <li>{@code GET  /api/network/webhook/{hookId}/stream} — SSE 实时推送（需登录）</li>
 *   <li>{@code GET  /api/network/webhook/{hookId}/history} — 历史列表（需登录）</li>
 *   <li>{@code GET  /api/network/webhook/{hookId}} — 端点信息（需登录）</li>
 *   <li>{@code PUT  /api/network/webhook/{hookId}/response} — 配置自定义响应（需登录）</li>
 *   <li>{@code DELETE /api/network/webhook/{hookId}} — 删除端点（需登录）</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/network/webhook")
@RequiredArgsConstructor
public class WebhookController {

    private final WebhookService webhookService;

    @PostMapping("/create")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public ResponseEntity<ApiResponse<WebhookCreateResponse>> create() {
        WebhookMeta meta = webhookService.createHook();
        // 拼接为当前上下文可访问的完整 URL（经 nginx 转发时由 X-Forwarded 头还原外部地址）
        String fullUrl = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/network/webhook/{id}")
                .buildAndExpand(meta.getHookId())
                .toUriString();
        WebhookCreateResponse resp = WebhookCreateResponse.builder()
                .hookId(meta.getHookId())
                .url(fullUrl)
                .expiresAt(meta.getCreatedAt() + Duration.ofHours(24).toMillis())
                .build();
        return ResponseEntity.ok(ApiResponse.success(resp));
    }

    /**
     * 公开接收端点：第三方回调入口，无登录态、无项目签名 header。
     * 由 SecurityConfig 配置 permitAll，并在 AntiReplayFilter/RateLimitFilter 中豁免。
     */
    @PostMapping("/{hookId}")
    public ResponseEntity<String> receive(@PathVariable String hookId, HttpServletRequest request) {
        return webhookService.receive(hookId, request);
    }

    @GetMapping(value = "/{hookId}/stream", produces = "text/event-stream")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public SseEmitter stream(@PathVariable String hookId, HttpServletResponse response) {
        // 关闭代理缓冲，确保 SSE 实时推送到浏览器（配合 nginx proxy_buffering off）
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        return webhookService.subscribe(hookId);
    }

    @GetMapping("/{hookId}/history")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public ResponseEntity<ApiResponse<java.util.List<WebhookHistoryItem>>> history(@PathVariable String hookId) {
        return ResponseEntity.ok(ApiResponse.success(webhookService.getHistory(hookId)));
    }

    @GetMapping("/{hookId}")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public ResponseEntity<ApiResponse<WebhookInfo>> info(@PathVariable String hookId) {
        return ResponseEntity.ok(ApiResponse.success(webhookService.getInfo(hookId)));
    }

    @PutMapping("/{hookId}/response")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public ResponseEntity<ApiResponse<Void>> saveResponse(
            @PathVariable String hookId, @RequestBody WebhookCustomResponse response) {
        webhookService.saveCustomResponse(hookId, response);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @DeleteMapping("/{hookId}")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable String hookId) {
        webhookService.deleteHook(hookId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
