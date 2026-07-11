package com.miao.toolbox.user.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.user.dto.UpdatePasswordRequest;
import com.miao.toolbox.user.dto.UpdateProfileRequest;
import com.miao.toolbox.user.dto.UserInfoResponse;
import com.miao.toolbox.user.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

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
}
