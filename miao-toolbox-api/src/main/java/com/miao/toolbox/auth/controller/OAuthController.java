package com.miao.toolbox.auth.controller;

import com.miao.toolbox.auth.dto.RoleBrief;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.oauth.OAuthProperties;
import com.miao.toolbox.auth.oauth.GoogleOAuthProperties;
import com.miao.toolbox.auth.oauth.GitHubOAuthService;
import com.miao.toolbox.auth.oauth.GoogleOAuthService;
import com.miao.toolbox.auth.service.JwtService;
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
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
    private final JwtService jwtService;

    @GetMapping("/github")
    public void authorizeGithub(
            @RequestParam(value = "bind", required = false, defaultValue = "false") boolean bind,
            @RequestParam(value = "state", required = false) String frontendState,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        String inviteToken = extractInviteToken(frontendState);
        String redirectUrl;
        User bindUser = resolveBindUser(bind, principal, request);
        if (bindUser != null) {
            redirectUrl = gitHubOAuthService.buildBindAuthorizationUrl(bindUser.getId());
        } else {
            redirectUrl = gitHubOAuthService.buildAuthorizationUrl(inviteToken);
        }
        log.info("OAuth authorize: bind={}, inviteToken={}, redirecting to GitHub", bind, inviteToken != null ? "***" : "null");
        // 清除绑定 cookie（一次性使用）
        clearBindCookie(response);
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
            @RequestParam(value = "state", required = false) String frontendState,
            @AuthenticationPrincipal Object principal,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        String inviteToken = extractInviteToken(frontendState);
        String redirectUrl;
        User bindUser = resolveBindUser(bind, principal, request);
        if (bindUser != null) {
            redirectUrl = googleOAuthService.buildBindAuthorizationUrl(bindUser.getId());
        } else {
            redirectUrl = googleOAuthService.buildAuthorizationUrl(inviteToken);
        }
        log.info("OAuth authorize: bind={}, inviteToken={}, redirecting to Google", bind, inviteToken != null ? "***" : "null");
        // 清除绑定 cookie（一次性使用）
        clearBindCookie(response);
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

    /**
     * 从前端传来的 state 参数中提取 inviteToken。
     * 前端格式：base64(JSON({invite: "token"}))，由 authService.getOAuthRegisterUrl 生成。
     */
    private String extractInviteToken(String frontendState) {
        if (frontendState == null || frontendState.isBlank()) {
            return null;
        }
        try {
            String decoded = new String(Base64.getDecoder().decode(frontendState), StandardCharsets.UTF_8);
            @SuppressWarnings("unchecked")
            Map<String, String> payload = new com.fasterxml.jackson.databind.ObjectMapper().readValue(decoded, Map.class);
            return payload.get("invite");
        } catch (Exception e) {
            log.debug("Failed to extract inviteToken from frontend state, ignoring: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 解析绑定场景下的当前用户。
     * 优先使用 Spring Security 上下文中的已认证用户；
     * 若不可用（OAuth 端点为 permitAll），则从前端写入的临时 cookie 中读取 JWT 并验证。
     */
    private User resolveBindUser(boolean bind, Object principal, HttpServletRequest request) {
        if (!bind) return null;

        // 1. 尝试从 Security 上下文获取
        if (principal instanceof User user) {
            return user;
        }

        // 2. 从临时 cookie 中读取 JWT
        String token = extractCookieValue(request, "miao_bind_token");
        if (token == null || token.isBlank()) {
            log.warn("OAuth bind requested but no authenticated user and no bind cookie found");
            return null;
        }

        try {
            var claims = jwtService.validateAccessToken(token);
            Long userId = jwtService.extractUserId(claims);
            // 返回一个仅含 ID 的 User 对象，供 buildBindAuthorizationUrl 使用
            User cookieUser = new User();
            cookieUser.setId(userId);
            log.info("OAuth bind user resolved from cookie: userId={}", userId);
            return cookieUser;
        } catch (Exception e) {
            log.warn("OAuth bind cookie token validation failed: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 从请求 cookie 中提取指定名称的值。
     */
    private String extractCookieValue(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    /**
     * 清除绑定用的临时 cookie（一次性使用后立即删除）。
     */
    private void clearBindCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie("miao_bind_token", "");
        cookie.setPath("/api/auth/oauth");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
    }
}
