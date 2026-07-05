package com.miao.toolbox.admin.controller;

import com.miao.toolbox.admin.dto.AdminUserResponse;
import com.miao.toolbox.admin.dto.SetRateLimitRequest;
import com.miao.toolbox.admin.dto.SetRoleRequest;
import com.miao.toolbox.admin.service.UserManageService;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class AdminUserController {

    private final UserManageService userManageService;

    @GetMapping
    public ApiResponse<PagedResponse<AdminUserResponse>> listUsers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return ApiResponse.success(userManageService.listUsers(page, pageSize));
    }

    @PutMapping("/{userId}/disable")
    public ResponseEntity<ApiResponse<Void>> disableUser(
            @PathVariable Long userId,
            @AuthenticationPrincipal Object principal) {
        Long operatorId = extractUserId(principal);
        userManageService.disableUser(userId, operatorId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PutMapping("/{userId}/enable")
    public ResponseEntity<ApiResponse<Void>> enableUser(
            @PathVariable Long userId,
            @AuthenticationPrincipal Object principal) {
        Long operatorId = extractUserId(principal);
        userManageService.enableUser(userId, operatorId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PutMapping("/{userId}/roles")
    public ResponseEntity<ApiResponse<Void>> setRole(
            @PathVariable Long userId,
            @Valid @RequestBody SetRoleRequest request,
            @AuthenticationPrincipal Object principal) {
        Long operatorId = extractUserId(principal);
        userManageService.setRole(userId, request, operatorId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PutMapping("/{userId}/rate-limit")
    public ResponseEntity<ApiResponse<Void>> setRateLimit(
            @PathVariable Long userId,
            @Valid @RequestBody SetRateLimitRequest request,
            @AuthenticationPrincipal Object principal) {
        Long operatorId = extractUserId(principal);
        userManageService.setRateLimit(userId, request, operatorId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof User user) {
            return user.getId();
        }
        return null;
    }
}
