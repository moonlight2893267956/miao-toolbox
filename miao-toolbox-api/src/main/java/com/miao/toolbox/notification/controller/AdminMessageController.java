package com.miao.toolbox.notification.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.notification.dto.MessageResponse;
import com.miao.toolbox.notification.dto.SendMessageRequest;
import com.miao.toolbox.notification.entity.Message;
import com.miao.toolbox.notification.service.NotificationService;
import com.miao.toolbox.storage.model.CosObjectResult;
import com.miao.toolbox.storage.service.StorageService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * 管理员消息/公告管理 API
 * <p>
 * 需要 SUPER_ADMIN 角色。路径前缀 /api/admin/messages
 */
@Slf4j
@RestController
@RequestMapping("/api/admin/messages")
@RequiredArgsConstructor
public class AdminMessageController {

    /** 允许的图片 MIME 类型 */
    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/jpeg", "image/png", "image/gif", "image/webp");

    /** 消息配图大小上限：5MB */
    private static final long MAX_IMAGE_SIZE = 5 * 1024 * 1024L;

    private final NotificationService notificationService;
    private final StorageService storageService;

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
     * 上传消息配图（multipart/form-data）
     * <p>
     * 图片存入 COS messages/ 前缀下，返回 cosKey 供发送/编辑消息时携带。
     * 仅允许 jpeg/png/gif/webp，上限 5MB。
     */
    @PostMapping(value = "/upload-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<Map<String, String>> uploadImage(
            @RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "请选择要上传的图片", 400);
        }
        if (file.getSize() > MAX_IMAGE_SIZE) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "图片大小不能超过 5MB", 400);
        }

        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_IMAGE_TYPES.contains(contentType.toLowerCase())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "仅支持 JPG/PNG/GIF/WebP 格式图片", 400);
        }

        String cosKey = storageService.buildMessageImageKey(file.getOriginalFilename());
        try {
            CosObjectResult result = storageService.putObject(
                    cosKey, file.getInputStream(), file.getSize(), contentType);
            log.info("消息配图上传成功: cosKey={}, eTag={}", result.getKey(), result.getETag());
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "图片读取失败: " + e.getMessage(), 500);
        }
        return ApiResponse.success(Map.of("cosKey", cosKey));
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
                messageId, request.getTitle(), request.getContent(), request.getImageCosKey());
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

        /** 消息配图 COS key（传 null 表示移除配图） */
        private String imageCosKey;
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
