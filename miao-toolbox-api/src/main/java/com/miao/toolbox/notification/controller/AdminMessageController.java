package com.miao.toolbox.notification.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.notification.dto.MessageResponse;
import com.miao.toolbox.notification.dto.SendMessageRequest;
import com.miao.toolbox.notification.entity.Message;
import com.miao.toolbox.notification.service.NotificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * 管理员消息/公告管理 API
 * <p>
 * 需要 SUPER_ADMIN 角色。路径前缀 /api/admin/messages
 */
@RestController
@RequestMapping("/api/admin/messages")
@RequiredArgsConstructor
public class AdminMessageController {

    private final NotificationService notificationService;

    /**
     * 发送消息（定向或全员广播）
     */
    @PostMapping
    public ResponseEntity<ApiResponse<Message>> sendMessage(
            @AuthenticationPrincipal Object principal,
            @Valid @RequestBody SendMessageRequest request) {
        Long senderId = extractUserId(principal);
        Message message = notificationService.sendMessage(request, senderId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(message));
    }

    /**
     * 查询公告列表
     */
    @GetMapping("/announcements")
    public ApiResponse<com.miao.toolbox.common.response.PagedResponse<MessageResponse>> listAnnouncements(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        return ApiResponse.success(notificationService.listAnnouncements(page, pageSize));
    }

    /**
     * 查询公告的定向接收人列表
     */
    @GetMapping("/announcements/{messageId}/recipients")
    public ApiResponse<List<RecipientInfo>> listAnnouncementRecipients(@PathVariable Long messageId) {
        return ApiResponse.success(notificationService.listAnnouncementRecipients(messageId));
    }

    /**
     * 编辑公告
     */
    @PutMapping("/announcements/{messageId}")
    public ApiResponse<MessageResponse> updateAnnouncement(
            @PathVariable Long messageId,
            @Valid @RequestBody UpdateAnnouncementRequest request) {
        Message updated = notificationService.updateAnnouncement(
                messageId, request.getTitle(), request.getContent());
        // 返回更新后的公告信息
        return ApiResponse.success(null);
    }

    /**
     * 删除公告（软删除）
     */
    @DeleteMapping("/announcements/{messageId}")
    public ApiResponse<Void> deleteAnnouncement(@PathVariable Long messageId) {
        notificationService.deleteAnnouncement(messageId);
        return ApiResponse.success(null);
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof User user) {
            return user.getId();
        }
        return null;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UpdateAnnouncementRequest {
        @NotBlank(message = "标题不能为空")
        private String title;

        @NotBlank(message = "内容不能为空")
        private String content;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class RecipientInfo {
        private Long userId;
        private String username;
        private String email;
    }
}
