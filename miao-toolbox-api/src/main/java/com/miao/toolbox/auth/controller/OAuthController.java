package com.miao.toolbox.auth.controller;

import com.miao.toolbox.auth.dto.RoleBrief;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.oauth.OAuthProperties;
import com.miao.toolbox.auth.oauth.GoogleOAuthProperties;
import com.miao.toolbox.auth.oauth.GitHubOAuthService;
import com.miao.toolbox.auth.oauth.GoogleOAuthService;
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/auth/oauth")
@RequiredArgsConstructor
public class OAuthController {

    private final GitHubOAuthService gitHubOAuthService;
    private final GoogleOAuthService googleOAuthService;
    private final OAuthProperties oAuthProperties;
    private final GoogleOAuthProperties googleOAuthProperties;

    @GetMapping("/github")
    public void authorizeGithub(
            @RequestParam(value = "bind", required = false, defaultValue = "false") boolean bind,
            @AuthenticationPrincipal Object principal,
            HttpServletResponse response) throws IOException {
        String redirectUrl;
        if (bind && principal instanceof User user) {
            redirectUrl = gitHubOAuthService.buildBindAuthorizationUrl(user.getId());
        } else {
            redirectUrl = gitHubOAuthService.buildAuthorizationUrl();
        }
        log.info("OAuth authorize: bind={}, redirecting to GitHub", bind);
        response.sendRedirect(redirectUrl);
    }

    @GetMapping("/github/callback")
    public void githubCallback(
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            @RequestParam(value = "error", required = false) String error,
            HttpServletResponse response) throws IOException {
        // 处理 GitHub OAuth 错误（用户拒绝授权等）
        if (error != null || code == null) {
            log.warn("GitHub OAuth callback error: {}", error);
            response.sendRedirect(oAuthProperties.getFrontendCallbackUrl() + "#error=oauth_failed");
            return;
        }

        log.info("OAuth callback received: code={}, state={}", code != null ? "***" : "null", state);

        try {
            LoginResponse loginResponse = gitHubOAuthService.handleCallback(code, state, response);

            String fragment = buildOAuthFragment(loginResponse);
            log.info("OAuth callback success: userId={}, username={}", loginResponse.getUser().getId(), loginResponse.getUser().getUsername());
            response.sendRedirect(oAuthProperties.getFrontendCallbackUrl() + "#" + fragment);
        } catch (AuthException e) {
            // 登录类失败（token 交换/state 校验等）：仅回传通用错误，不泄露内部信息
            log.warn("GitHub OAuth callback auth error: {}", e.getMessage());
            response.sendRedirect(buildErrorRedirect(oAuthProperties.getFrontendCallbackUrl(), null));
        } catch (BusinessException e) {
            // 业务类失败（如绑定冲突）：回传可读原因，前端据此提示并跳回对应页面
            log.warn("GitHub OAuth callback business error: {}", e.getMessage());
            response.sendRedirect(buildErrorRedirect(oAuthProperties.getFrontendCallbackUrl(), e.getMessage()));
        } catch (Exception e) {
            log.error("GitHub OAuth callback failed", e);
            response.sendRedirect(buildErrorRedirect(oAuthProperties.getFrontendCallbackUrl(), null));
        }
    }

    @GetMapping("/google")
    public void authorizeGoogle(
            @RequestParam(value = "bind", required = false, defaultValue = "false") boolean bind,
            @AuthenticationPrincipal Object principal,
            HttpServletResponse response) throws IOException {
        String redirectUrl;
        if (bind && principal instanceof User user) {
            redirectUrl = googleOAuthService.buildBindAuthorizationUrl(user.getId());
        } else {
            redirectUrl = googleOAuthService.buildAuthorizationUrl();
        }
        log.info("OAuth authorize: bind={}, redirecting to Google", bind);
        response.sendRedirect(redirectUrl);
    }

    @GetMapping("/google/callback")
    public void googleCallback(
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            @RequestParam(value = "error", required = false) String error,
            HttpServletResponse response) throws IOException {
        if (error != null || code == null) {
            log.warn("Google OAuth callback error: {}", error);
            response.sendRedirect(googleOAuthProperties.getFrontendCallbackUrl() + "#error=oauth_failed");
            return;
        }

        log.info("Google OAuth callback received: code={}, state={}", code != null ? "***" : "null", state);

        try {
            LoginResponse loginResponse = googleOAuthService.handleCallback(code, state, response);

            String fragment = buildOAuthFragment(loginResponse);
            log.info("Google OAuth callback success: userId={}, username={}", loginResponse.getUser().getId(), loginResponse.getUser().getUsername());
            response.sendRedirect(googleOAuthProperties.getFrontendCallbackUrl() + "#" + fragment);
        } catch (AuthException e) {
            log.warn("Google OAuth callback auth error: {}", e.getMessage());
            response.sendRedirect(buildErrorRedirect(googleOAuthProperties.getFrontendCallbackUrl(), null));
        } catch (BusinessException e) {
            log.warn("Google OAuth callback business error: {}", e.getMessage());
            response.sendRedirect(buildErrorRedirect(googleOAuthProperties.getFrontendCallbackUrl(), e.getMessage()));
        } catch (Exception e) {
            log.error("Google OAuth callback failed", e);
            response.sendRedirect(buildErrorRedirect(googleOAuthProperties.getFrontendCallbackUrl(), null));
        }
    }

    /**
     * 构建 OAuth 失败重定向 URL。
     * 统一使用 fragment 传递错误码；若有可读原因（业务异常），附带 reason 供前端精确提示。
     *
     * @param frontendCallbackUrl 前端回调地址
     * @param reason              可展示的失败原因（为 null/空时仅回传通用错误码）
     */
    private String buildErrorRedirect(String frontendCallbackUrl, String reason) {
        String url = frontendCallbackUrl + "#error=oauth_failed";
        if (reason != null && !reason.isBlank()) {
            url += "&reason=" + URLEncoder.encode(reason, StandardCharsets.UTF_8);
        }
        return url;
    }

    /**
     * 构建 OAuth 回调的 URL fragment 参数。
     * 使用 URL fragment (#) 传递令牌，避免查询参数泄露到日志/Referer。
     */
    private String buildOAuthFragment(LoginResponse loginResponse) throws IOException {
        String rolesStr = loginResponse.getUser().getRoles().stream()
                .map(RoleBrief::getCode)
                .collect(Collectors.joining(","));
        String fragment = "token=" + URLEncoder.encode(loginResponse.getAccessToken(), StandardCharsets.UTF_8)
                + "&signingKey=" + URLEncoder.encode(loginResponse.getSigningKey(), StandardCharsets.UTF_8)
                + "&userId=" + loginResponse.getUser().getId()
                + "&username=" + URLEncoder.encode(loginResponse.getUser().getUsername(), StandardCharsets.UTF_8)
                + "&roles=" + URLEncoder.encode(rolesStr, StandardCharsets.UTF_8);

        if (Boolean.TRUE.equals(loginResponse.getMustChangePassword())) {
            fragment += "&mustChangePassword=true";
        }
        return fragment;
    }
}
