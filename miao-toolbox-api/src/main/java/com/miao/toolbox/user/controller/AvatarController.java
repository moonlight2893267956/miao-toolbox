package com.miao.toolbox.user.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.user.service.AvatarService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class AvatarController {

    private final AvatarService avatarService;

    @PostMapping("/me/avatar")
    public ResponseEntity<ApiResponse<String>> uploadAvatar(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        String avatarUrl = avatarService.uploadAvatar(user.getId(), file);
        return ResponseEntity.ok(ApiResponse.success(avatarUrl));
    }

    @PutMapping("/me/avatar/preset")
    public ResponseEntity<ApiResponse<String>> setPresetAvatar(
            @RequestBody java.util.Map<String, String> body,
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        String presetName = body.get("preset");
        if (presetName == null || presetName.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("VALIDATION_FAILED", "请选择预设头像", null));
        }
        String avatarUrl = avatarService.setPresetAvatar(user.getId(), presetName);
        return ResponseEntity.ok(ApiResponse.success(avatarUrl));
    }
}
