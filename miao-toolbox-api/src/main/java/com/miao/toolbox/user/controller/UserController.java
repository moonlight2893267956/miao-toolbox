package com.miao.toolbox.user.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.dto.ResetPasswordRequest;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.user.dto.BindEmailRequest;
import com.miao.toolbox.user.dto.UpdatePasswordRequest;
import com.miao.toolbox.user.dto.UpdateProfileRequest;
import com.miao.toolbox.user.dto.UserInfoResponse;
import com.miao.toolbox.user.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserRepository userRepository;

    /**
     * 搜索用户（供共享功能使用，支持用户名/邮箱搜索）
     */
    @GetMapping("/search")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> searchUsers(
            @AuthenticationPrincipal Object principal,
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "20") int limit) {
        if (!(principal instanceof User currentUser)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        limit = Math.min(Math.max(limit, 1), 50);
        Pageable pageable = PageRequest.of(0, limit);
        Page<User> userPage = keyword.isBlank()
                ? userRepository.findAll(pageable)
                : userRepository.findByUsernameContainingIgnoreCaseOrEmailContainingIgnoreCase(keyword, keyword, pageable);

        // 仅返回 id + username，不暴露邮箱等隐私字段
        List<Map<String, Object>> result = userPage.getContent().stream()
                .filter(u -> !u.getId().equals(currentUser.getId())) // 排除自己
                .map(u -> {
                    Map<String, Object> m = new java.util.HashMap<>();
                    m.put("id", u.getId());
                    m.put("username", u.getUsername());
                    return m;
                })
                .toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserInfoResponse>> getCurrentUser(
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        return ResponseEntity.ok(ApiResponse.success(userService.getCurrentUser(user.getId())));
    }

    @PutMapping("/me/profile")
    public ResponseEntity<ApiResponse<UserInfoResponse>> updateProfile(
            @Valid @RequestBody UpdateProfileRequest request,
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        return ResponseEntity.ok(ApiResponse.success(userService.updateProfile(user.getId(), request.getUsername())));
    }

    @PutMapping("/me/password")
    public ResponseEntity<ApiResponse<Void>> changePasswordWithVerification(
            @Valid @RequestBody UpdatePasswordRequest request,
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        userService.changePassword(user.getId(), request.getOldPassword(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/me/bind-github")
    public ResponseEntity<ApiResponse<String>> bindGithub(
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        return ResponseEntity.ok(ApiResponse.success(userService.getBindGithubUrl(user.getId())));
    }

    @DeleteMapping("/me/bind-github")
    public ResponseEntity<ApiResponse<Void>> unbindGithub(
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        userService.unbindGithub(user.getId());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/me/bind-google")
    public ResponseEntity<ApiResponse<String>> bindGoogle(
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        return ResponseEntity.ok(ApiResponse.success(userService.getBindGoogleUrl(user.getId())));
    }

    @DeleteMapping("/me/bind-google")
    public ResponseEntity<ApiResponse<Void>> unbindGoogle(
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        userService.unbindGoogle(user.getId());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/me/bind-email")
    public ResponseEntity<ApiResponse<UserInfoResponse>> bindEmail(
            @Valid @RequestBody BindEmailRequest request,
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        return ResponseEntity.ok(ApiResponse.success(userService.bindEmail(user.getId(), request.email(), request.code())));
    }

    @DeleteMapping("/me/bind-email")
    public ResponseEntity<ApiResponse<UserInfoResponse>> unbindEmail(
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        return ResponseEntity.ok(ApiResponse.success(userService.unbindEmail(user.getId())));
    }
}
