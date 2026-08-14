package com.miao.toolbox.notification.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.notification.dto.MessageDetailResponse;
import com.miao.toolbox.notification.dto.MessageResponse;
import com.miao.toolbox.notification.dto.SendMessageRequest;
import com.miao.toolbox.notification.dto.UnreadCountResponse;
import com.miao.toolbox.notification.service.NotificationService;
import com.miao.toolbox.storage.service.StorageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;
import java.util.Locale;
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
    private final StorageService storageService;

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
     * 获取消息配图（后端代理流式返回）
     * <p>
     * 校验用户对该消息的访问权后，从 COS 拉取图片流式返回。
     * 前端通过 axios 获取 blob 后创建 ObjectURL 渲染。
     */
    @GetMapping("/{messageId}/image")
    public ResponseEntity<InputStreamResource> getMessageImage(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long messageId) {
        Long userId = extractUserId(principal);
        String cosKey = notificationService.getMessageImageCosKey(userId, messageId);

        if (cosKey == null || cosKey.isBlank()) {
            throw new BusinessException(ErrorCode.MSG_NOT_FOUND, "该消息没有配图", 404);
        }

        InputStream inputStream = storageService.getObject(cosKey);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(resolveImageContentType(cosKey)))
                .header(org.springframework.http.HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .body(new InputStreamResource(inputStream));
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

    /**
     * 根据 COS key 的文件扩展名推断图片 MIME 类型（上传时已限定为白名单格式）
     */
    private String resolveImageContentType(String cosKey) {
        String lower = cosKey.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".gif")) {
            return "image/gif";
        }
        if (lower.endsWith(".webp")) {
            return "image/webp";
        }
        return MediaType.APPLICATION_OCTET_STREAM_VALUE;
    }
}
