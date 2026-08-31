package com.miao.toolbox.storage.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.storage.dto.CreateShareLinkRequest;
import com.miao.toolbox.storage.dto.ShareLinkDTO;
import com.miao.toolbox.storage.service.FileShareLinkService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 外链分享管理 API（需登录）
 * <p>
 * 路径前缀 /api/storage/share-links，复用现有的 JWT + HMAC 签名体系。
 * 与「站内用户间共享」（{@code /api/storage/files/{id}/shares}）互不干扰。
 */
@RestController
@RequestMapping("/api/storage/share-links")
@RequiredArgsConstructor
public class FileShareLinkController {

    private final FileShareLinkService fileShareLinkService;

    /**
     * 创建外链分享
     */
    @PostMapping
    public ApiResponse<ShareLinkDTO> createShareLink(
            @AuthenticationPrincipal Object principal,
            @RequestBody CreateShareLinkRequest request) {
        return ApiResponse.success(fileShareLinkService.createShareLink(extractUserId(principal), request));
    }

    /**
     * 我的分享列表
     */
    @GetMapping
    public ApiResponse<List<ShareLinkDTO>> listMyShareLinks(
            @AuthenticationPrincipal Object principal) {
        return ApiResponse.success(fileShareLinkService.listMyShareLinks(extractUserId(principal)));
    }

    /**
     * 取消分享
     */
    @DeleteMapping("/{linkId}")
    public ApiResponse<Void> revokeShareLink(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long linkId) {
        fileShareLinkService.revokeShareLink(extractUserId(principal), linkId);
        return ApiResponse.success(null);
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof User user) {
            return user.getId();
        }
        return null;
    }
}
