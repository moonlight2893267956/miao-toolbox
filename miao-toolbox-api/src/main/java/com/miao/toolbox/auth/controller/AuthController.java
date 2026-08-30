package com.miao.toolbox.auth.controller;

import com.miao.toolbox.auth.dto.ChangePasswordRequest;
import com.miao.toolbox.auth.dto.AccessibleRoutesResponse;
import com.miao.toolbox.auth.dto.EmailRegisterRequest;
import com.miao.toolbox.auth.dto.LoginRequest;
import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.dto.RegisterRequest;
import com.miao.toolbox.auth.dto.ResetPasswordRequest;
import com.miao.toolbox.auth.dto.VerifyEmailCodeRequest;
import com.miao.toolbox.auth.dto.VerifyEmailCodeResponse;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.service.AuthService;
import com.miao.toolbox.auth.service.EmailCodeService;
import com.miao.toolbox.auth.service.RouteAccessService;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.invite.dto.InvitePreviewResponse;
import com.miao.toolbox.invite.service.InviteService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final RouteAccessService routeAccessService;
    private final InviteService inviteService;
    private final EmailCodeService emailCodeService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<Void>> register(@Valid @RequestBody RegisterRequest request) {
        authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(null));
    }

    @PostMapping("/email/register")
    public ResponseEntity<ApiResponse<LoginResponse>> emailRegister(
            @Valid @RequestBody EmailRegisterRequest request,
            HttpServletResponse response) {
        LoginResponse loginResponse = authService.emailRegister(request, response);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(loginResponse));
    }

    @GetMapping("/invite/preview")
    public ResponseEntity<ApiResponse<InvitePreviewResponse>> previewInvite(@RequestParam String token) {
        return ResponseEntity.ok(ApiResponse.success(inviteService.preview(token)));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletResponse response) {
        LoginResponse loginResponse = authService.login(request, response);
        return ResponseEntity.ok(ApiResponse.success(loginResponse));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<LoginResponse>> refresh(
            @CookieValue(name = "refreshToken", required = false) String refreshToken,
            HttpServletResponse response) {
        LoginResponse loginResponse = authService.refresh(refreshToken, response);
        return ResponseEntity.ok(ApiResponse.success(loginResponse));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            @CookieValue(name = "refreshToken", required = false) String refreshToken,
            HttpServletResponse response) {
        authService.logout(refreshToken, response);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @GetMapping("/me/routes")
    public ResponseEntity<ApiResponse<AccessibleRoutesResponse>> getAccessibleRoutes(
            @AuthenticationPrincipal Object principal,
            Authentication authentication) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        return ResponseEntity.ok(ApiResponse.success(
                new AccessibleRoutesResponse(routeAccessService.getAccessibleRouteCodes(user.getId(), authentication))
        ));
    }

    @PutMapping("/password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @RequestBody ChangePasswordRequest request,
            @AuthenticationPrincipal Object principal) {
        if (!(principal instanceof User user)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("AUTH_UNAUTHORIZED", "未认证", null));
        }
        if (request.getNewPassword() == null || request.getNewPassword().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("VALIDATION_FAILED", "新密码不能为空", null));
        }
        if (request.getNewPassword().length() < 8 || request.getNewPassword().length() > 72) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("VALIDATION_FAILED", "密码长度为8-72位", null));
        }
        authService.changePassword(user.getId(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/email/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request.email(), request.code(), request.newPassword());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /**
     * 分步校验验证码（只校验，不消费）。
     *
     * <p>供多步骤流程（邮箱注册第一步、忘记密码第二步）在进入下一步之前即时反馈验证码是否正确。
     * 校验通过不会删除验证码，最终提交时仍会再次校验并消费。
     *
     * <p>该端点无需认证，因此校验次数受每日验证限流约束，防止暴力破解。
     */
    @PostMapping("/email/verify-code")
    public ResponseEntity<ApiResponse<VerifyEmailCodeResponse>> verifyEmailCode(
            @Valid @RequestBody VerifyEmailCodeRequest request) {
        boolean valid = emailCodeService.peekCode(request.email(), request.code(), request.purpose());
        return ResponseEntity.ok(ApiResponse.success(new VerifyEmailCodeResponse(valid)));
    }
}
