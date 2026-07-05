package com.miao.toolbox.auth.oauth;

import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.auth.service.AuthService;
import com.miao.toolbox.auth.service.JwtService;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.annotation.PreDestroy;

@Slf4j
@Service
public class GitHubOAuthService {

    private static final String GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
    private static final String GITHUB_USER_URL = "https://api.github.com/user";

    // #2: 服务端存储 state，用于回调校验
    // value: timestamp_ms + "," + mode(login/bind) + "," + userId(bind模式时携带)
    private final ConcurrentHashMap<String, String> stateStore = new ConcurrentHashMap<>();
    private static final long STATE_TTL_MS = 10 * 60 * 1000L; // 10 minutes

    private final OAuthProperties oAuthProperties;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final JwtService jwtService;
    private final AuthService authService;
    private final RestTemplate restTemplate;

    // 定时清理过期 state 条目，防止内存泄漏
    private final java.util.concurrent.ScheduledExecutorService cleanupExecutor =
            java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "oauth-state-cleanup");
                t.setDaemon(true);
                return t;
            });

    public GitHubOAuthService(OAuthProperties oAuthProperties, UserRepository userRepository,
                              RoleRepository roleRepository, JwtService jwtService,
                              AuthService authService, RestTemplate restTemplate) {
        this.oAuthProperties = oAuthProperties;
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.jwtService = jwtService;
        this.authService = authService;
        this.restTemplate = restTemplate;
        // 每5分钟清理过期 state
        cleanupExecutor.scheduleAtFixedRate(this::evictExpiredStates, 5, 5, java.util.concurrent.TimeUnit.MINUTES);
    }

    @PreDestroy
    public void destroy() {
        cleanupExecutor.shutdownNow();
    }

    private void evictExpiredStates() {
        long now = System.currentTimeMillis();
        stateStore.entrySet().removeIf(entry -> {
            String[] parts = entry.getValue().split(",");
            long timestamp = Long.parseLong(parts[0]);
            return now - timestamp > STATE_TTL_MS;
        });
    }

    public String buildAuthorizationUrl() {
        // #2: 生成 state 并存储
        String state = jwtService.generateSigningKey();
        stateStore.put(state, System.currentTimeMillis() + ",login,0");

        // #29: URL 编码参数
        return "https://github.com/login/oauth/authorize"
                + "?client_id=" + URLEncoder.encode(oAuthProperties.getClientId(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(oAuthProperties.getRedirectUri(), StandardCharsets.UTF_8)
                + "&scope=" + URLEncoder.encode(oAuthProperties.getScope(), StandardCharsets.UTF_8)
                + "&state=" + URLEncoder.encode(state, StandardCharsets.UTF_8);
    }

    public String buildBindAuthorizationUrl(Long userId) {
        String state = jwtService.generateSigningKey();
        stateStore.put(state, System.currentTimeMillis() + ",bind," + userId);

        return "https://github.com/login/oauth/authorize"
                + "?client_id=" + URLEncoder.encode(oAuthProperties.getClientId(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(oAuthProperties.getRedirectUri(), StandardCharsets.UTF_8)
                + "&scope=" + URLEncoder.encode(oAuthProperties.getScope(), StandardCharsets.UTF_8)
                + "&state=" + URLEncoder.encode(state, StandardCharsets.UTF_8);
    }

    @Transactional
    public LoginResponse handleCallback(String code, String state, HttpServletResponse response) {
        // #2: 验证 state 参数防止 CSRF
        if (state == null || state.isBlank()) {
            log.warn("OAuth callback missing state parameter");
            throw AuthException.loginFailed();
        }
        String stateData = stateStore.remove(state);
        if (stateData == null) {
            log.warn("OAuth callback invalid or expired state parameter");
            throw AuthException.loginFailed();
        }
        String[] stateParts = stateData.split(",");
        long stateCreatedAt = Long.parseLong(stateParts[0]);
        String mode = stateParts.length > 1 ? stateParts[1] : "login";
        long bindUserId = stateParts.length > 2 ? Long.parseLong(stateParts[2]) : 0;

        if (System.currentTimeMillis() - stateCreatedAt > STATE_TTL_MS) {
            log.warn("OAuth callback expired state parameter");
            throw AuthException.loginFailed();
        }

        // Exchange code for access token
        String accessToken = exchangeCodeForToken(code);

        // Fetch GitHub user profile
        GitHubUser githubUser = fetchGitHubUser(accessToken);

        // 绑定模式：将 GitHub 账号关联到已有用户
        if ("bind".equals(mode) && bindUserId > 0) {
            User user = userRepository.findById(bindUserId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
            if (user.getGithubId() != null) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "已绑定 GitHub 账号", 400);
            }
            // 检查 GitHub 账号是否被其他用户绑定
            userRepository.findByGithubId(String.valueOf(githubUser.getId()))
                    .ifPresent(existingUser -> {
                        throw new BusinessException(ErrorCode.VALIDATION_FAILED, "该 GitHub 账号已被其他用户绑定", 400);
                    });
            user.setGithubId(String.valueOf(githubUser.getId()));
            user.setGithubUsername(githubUser.getLogin());
            userRepository.save(user);
            // 绑定成功后仍返回 token（用于前端刷新状态），但主要通过 userinfo 接口获取更新
            String jwtAccessToken = jwtService.generateAccessToken(user.getId(), user.getUsername(), user.getRoleCodes());
            String refreshToken = jwtService.generateRefreshToken(user.getId());
            String signingKey = jwtService.generateSigningKey();
            user.setSigningKey(signingKey);
            userRepository.save(user);
            authService.storeRefreshToken(user.getId(), refreshToken);
            authService.addRefreshTokenCookie(response, refreshToken);

            return LoginResponse.builder()
                    .accessToken(jwtAccessToken)
                    .signingKey(signingKey)
                    .mustChangePassword(Boolean.TRUE.equals(user.getMustChangePassword()))
                    .user(LoginResponse.UserInfo.builder()
                            .id(user.getId())
                            .username(user.getUsername())
                            .roles(user.toRoleBriefs())
                            .build())
                    .build();
        }

        // 登录模式：原有逻辑
        // Find or create user (#28: handle race condition with DataIntegrityViolationException)
        User user;
        try {
            user = userRepository.findByGithubId(String.valueOf(githubUser.getId()))
                    .orElseGet(() -> createOAuthUser(githubUser));
        } catch (DataIntegrityViolationException e) {
            // Concurrent OAuth with same GitHub ID — retry find
            log.warn("Concurrent OAuth user creation, retrying find");
            user = userRepository.findByGithubId(String.valueOf(githubUser.getId()))
                    .orElseThrow(() -> new BusinessException(ErrorCode.SYSTEM_ERROR, "登录失败，请重试", 500));
        }

        if (!user.getIsEnabled()) {
            throw AuthException.loginFailed();
        }

        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now(ZoneOffset.UTC))) {
            throw AuthException.loginFailed();
        }

        // Generate signing key
        String signingKey = jwtService.generateSigningKey();
        user.setSigningKey(signingKey);
        userRepository.save(user);

        // Generate tokens
        String jwtAccessToken = jwtService.generateAccessToken(user.getId(), user.getUsername(), user.getRoleCodes());
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        // Store refresh token via AuthService
        authService.storeRefreshToken(user.getId(), refreshToken);

        // Set refresh token cookie
        authService.addRefreshTokenCookie(response, refreshToken);

        return LoginResponse.builder()
                .accessToken(jwtAccessToken)
                .signingKey(signingKey)
                .mustChangePassword(Boolean.TRUE.equals(user.getMustChangePassword()))
                .user(LoginResponse.UserInfo.builder()
                        .id(user.getId())
                        .username(user.getUsername())
                        .roles(user.toRoleBriefs())
                        .build())
                .build();
    }

    private String exchangeCodeForToken(String code) {
        RuntimeException lastException = null;

        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.set("Accept", "application/json");
                headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

                MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
                body.add("client_id", oAuthProperties.getClientId());
                body.add("client_secret", oAuthProperties.getClientSecret());
                body.add("code", code);
                body.add("redirect_uri", oAuthProperties.getRedirectUri());

                HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);

                ResponseEntity<Map> apiResponse = restTemplate.postForEntity(GITHUB_TOKEN_URL, request, Map.class);

                if (apiResponse.getBody() == null || apiResponse.getBody().containsKey("error")) {
                    log.error("GitHub OAuth token exchange failed: {}", apiResponse.getBody());
                    throw AuthException.loginFailed();
                }

                return (String) apiResponse.getBody().get("access_token");
            } catch (HttpClientErrorException | HttpServerErrorException e) {
                log.error("GitHub OAuth token exchange HTTP error: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
                throw AuthException.loginFailed();
            } catch (RestClientException e) {
                // 网络抖动（代理不稳定等），重试
                lastException = e;
                if (attempt < 3) {
                    log.warn("GitHub OAuth token exchange attempt {}/3 failed, retrying...", attempt, e);
                    try { Thread.sleep(1000L * attempt); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        lastException = new RuntimeException("OAuth token exchange interrupted", ie);
                        break;
                    }
                }
            }
        }

        log.error("GitHub OAuth token exchange failed after 3 attempts", lastException);
        throw AuthException.loginFailed();
    }

    private GitHubUser fetchGitHubUser(String accessToken) {
        RuntimeException lastException = null;

        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(accessToken);
                headers.set("Accept", "application/json");

                HttpEntity<Void> request = new HttpEntity<>(headers);

                ResponseEntity<GitHubUser> response = restTemplate.exchange(
                        GITHUB_USER_URL, HttpMethod.GET, request, GitHubUser.class);

                if (response.getBody() == null) {
                    throw AuthException.loginFailed();
                }

                return response.getBody();
            } catch (HttpClientErrorException | HttpServerErrorException e) {
                log.error("GitHub OAuth fetch user HTTP error: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
                throw AuthException.loginFailed();
            } catch (RestClientException e) {
                lastException = e;
                if (attempt < 3) {
                    log.warn("GitHub OAuth fetch user attempt {}/3 failed, retrying...", attempt, e);
                    try { Thread.sleep(1000L * attempt); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        lastException = new RuntimeException("OAuth fetch user interrupted", ie);
                        break;
                    }
                }
            }
        }

        log.error("GitHub OAuth fetch user failed after 3 attempts", lastException);
        throw AuthException.loginFailed();
    }

    private User createOAuthUser(GitHubUser githubUser) {
        String username = generateUniqueUsername(githubUser.getLogin());

        Role userRole = roleRepository.findByCode("USER")
                .orElseThrow(() -> new BusinessException(ErrorCode.SYSTEM_ERROR, "系统角色配置异常", 500));

        User user = User.builder()
                .username(username)
                .githubId(String.valueOf(githubUser.getId()))
                .githubUsername(githubUser.getLogin())
                .email(githubUser.getEmail())
                .roles(Set.of(userRole))
                .isEnabled(true)
                .mustChangePassword(false)
                .loginFailCount(0)
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();

        try {
            return userRepository.save(user);
        } catch (DataIntegrityViolationException e) {
            // #28: 并发创建时唯一约束冲突，重试查找
            log.warn("Concurrent user creation for githubId={}, retrying find", githubUser.getId());
            return userRepository.findByGithubId(String.valueOf(githubUser.getId()))
                    .orElseThrow(() -> new BusinessException(ErrorCode.SYSTEM_ERROR, "注册失败，请重试", 500));
        }
    }

    private String generateUniqueUsername(String githubLogin) {
        String base = githubLogin.length() > 20 ? githubLogin.substring(0, 20) : githubLogin;
        if (!userRepository.existsByUsername(base)) {
            return base;
        }
        for (int i = 1; i < 100; i++) {
            String candidate = base.length() > 17 ? base.substring(0, 17) + "_" + i : base + "_" + i;
            if (!userRepository.existsByUsername(candidate)) {
                return candidate;
            }
        }
        return base + "_" + System.currentTimeMillis();
    }
}
