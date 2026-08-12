package com.miao.toolbox.notification.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.notification.dto.MessageDetailResponse;
import com.miao.toolbox.notification.dto.MessageResponse;
import com.miao.toolbox.notification.dto.SendMessageRequest;
import com.miao.toolbox.notification.dto.UnreadCountResponse;
import com.miao.toolbox.notification.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 用户端消息 API
 * <p>
 * 所有接口需要登录认证。路径前缀 /api/messages
 */
@RestController
@RequestMapping("/api/messages")
@RequiredArgsConstructor
public class MessageController {

    private final NotificationService notificationService;

    /**
     * 获取未读消息计数
     */
    @GetMapping("/unread-count")
    public ApiResponse<UnreadCountResponse> getUnreadCount(
            @AuthenticationPrincipal Object principal) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(notificationService.getUnreadCount(userId));
    }

    /**
     * 查询消息列表（分页）
     */
    @GetMapping
    public ApiResponse<PagedResponse<MessageResponse>> listMessages(
            @AuthenticationPrincipal Object principal,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize,
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "readStatus", required = false) String readStatus) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(notificationService.listMessages(userId, page, pageSize, type, readStatus));
    }

    /**
     * 获取消息详情
     */
    @GetMapping("/{messageId}")
    public ApiResponse<MessageDetailResponse> getMessageDetail(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long messageId) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(notificationService.getMessageDetail(userId, messageId));
    }

    /**
     * 标记单条消息已读
     */
    @PutMapping("/{messageId}/read")
    public ApiResponse<Void> markAsRead(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long messageId) {
        Long userId = extractUserId(principal);
        notificationService.markAsRead(userId, messageId);
        return ApiResponse.success(null);
    }

    /**
     * 标记所有消息已读
     */
    @PutMapping("/read-all")
    public ApiResponse<Map<String, Long>> markAllAsRead(
            @AuthenticationPrincipal Object principal) {
        Long userId = extractUserId(principal);
        long count = notificationService.markAllAsRead(userId);
        return ApiResponse.success(Map.of("count", count));
    }

    /**
     * 隐藏消息（仅对当前用户不可见）
     */
    @DeleteMapping("/{messageId}")
    public ApiResponse<Void> dismissMessage(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long messageId) {
        Long userId = extractUserId(principal);
        notificationService.dismissMessage(userId, messageId);
        return ApiResponse.success(null);
    }

    /**
     * 批量隐藏消息
     */
    @DeleteMapping
    public ApiResponse<Void> dismissMessages(
            @AuthenticationPrincipal Object principal,
            @RequestBody java.util.List<Long> messageIds) {
        Long userId = extractUserId(principal);
        notificationService.dismissMessages(userId, messageIds);
        return ApiResponse.success(null);
    }

    // ==================== 工具方法 ====================

    private Long extractUserId(Object principal) {
        if (principal instanceof User user) {
            return user.getId();
        }
        return null;
    }
}
