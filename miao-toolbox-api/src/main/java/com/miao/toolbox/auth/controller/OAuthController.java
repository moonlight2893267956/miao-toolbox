package com.miao.toolbox.auth.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.oauth.OAuthProperties;
import com.miao.toolbox.auth.oauth.GitHubOAuthService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Slf4j
@RestController
@RequestMapping("/api/auth/oauth")
@RequiredArgsConstructor
public class OAuthController {

    private final GitHubOAuthService gitHubOAuthService;
    private final OAuthProperties oAuthProperties;

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

            // #1: 使用 URL fragment (#) 传递令牌，避免查询参数泄露到日志/Referer
            // 前端通过 JavaScript 读取 window.location.hash 解析
            String fragment = "token=" + URLEncoder.encode(loginResponse.getAccessToken(), StandardCharsets.UTF_8)
                    + "&signingKey=" + URLEncoder.encode(loginResponse.getSigningKey(), StandardCharsets.UTF_8)
                    + "&userId=" + loginResponse.getUser().getId()
                    + "&username=" + URLEncoder.encode(loginResponse.getUser().getUsername(), StandardCharsets.UTF_8)
                    + "&role=" + loginResponse.getUser().getRole();

            if (Boolean.TRUE.equals(loginResponse.getMustChangePassword())) {
                fragment += "&mustChangePassword=true";
            }

            log.info("OAuth callback success: userId={}, username={}", loginResponse.getUser().getId(), loginResponse.getUser().getUsername());
            response.sendRedirect(oAuthProperties.getFrontendCallbackUrl() + "#" + fragment);
        } catch (Exception e) {
            log.error("OAuth callback failed", e);
            response.sendRedirect(oAuthProperties.getFrontendCallbackUrl() + "#error=oauth_failed");
        }
    }
}
