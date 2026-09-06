package com.miao.toolbox.storage.controller;

import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.storage.dto.TrashItemDTO.TrashViewDTO;
import com.miao.toolbox.storage.service.TrashService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * 废纸篓 API（V32）
 * <p>
 * 删除文件/目录先进废纸篓（软删除，见 FileService），
 * 本控制器提供废纸篓的查看 / 恢复 / 彻底删除 / 清空。
 * 30 天过期自动清理由 TrashService 定时任务执行，不提供手动接口。
 * <p>
 * 路径挂在 /api/storage 下（与 FileController 一致），复用 JWT + HMAC 签名体系。
 */
@RestController
@RequestMapping("/api/storage/trash")
@RequiredArgsConstructor
public class TrashController {

    private final TrashService trashService;

    /**
     * 废纸篓列表（顶层文件 + 顶层目录，子孙随顶层展示/恢复）
     */
    @GetMapping
    public ApiResponse<TrashViewDTO> list(@AuthenticationPrincipal Object principal) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(trashService.list(userId));
    }

    /**
     * 恢复文件到原位置
     */
    @PostMapping("/files/{fileId}/restore")
    public ApiResponse<Void> restoreFile(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId) {
        trashService.restoreFile(extractUserId(principal), fileId);
        return ApiResponse.success(null);
    }

    /**
     * 恢复目录整棵子树到原位置
     */
    @PostMapping("/directories/{dirId}/restore")
    public ApiResponse<Void> restoreDirectory(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long dirId) {
        trashService.restoreDirectory(extractUserId(principal), dirId);
        return ApiResponse.success(null);
    }

    /**
     * 彻底删除单个文件（物理删除 + 回退配额 + 清理 COS）
     */
    @DeleteMapping("/files/{fileId}")
    public ApiResponse<Void> purgeFile(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId) {
        trashService.purgeFile(extractUserId(principal), fileId);
        return ApiResponse.success(null);
    }

    /**
     * 彻底删除目录整棵子树
     */
    @DeleteMapping("/directories/{dirId}")
    public ApiResponse<Void> purgeDirectory(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long dirId) {
        trashService.purgeDirectory(extractUserId(principal), dirId);
        return ApiResponse.success(null);
    }

    /**
     * 清空废纸篓
     */
    @DeleteMapping
    public ApiResponse<Void> purgeAll(@AuthenticationPrincipal Object principal) {
        trashService.purgeAll(extractUserId(principal));
        return ApiResponse.success(null);
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof com.miao.toolbox.auth.entity.User user) {
            return user.getId();
        }
        return null;
    }
}
