package com.miao.toolbox.auth.oauth;

import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.entity.User;
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
import java.util.concurrent.ConcurrentHashMap;

import jakarta.annotation.PreDestroy;

@Slf4j
@Service
public class GoogleOAuthService {

    private static final String GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String GOOGLE_USER_URL = "https://openidconnect.googleapis.com/v1/userinfo";

    // 服务端存储 state，用于回调校验
    // value: timestamp_ms + "," + mode(login/bind) + "," + userId(bind模式时携带)
    private final ConcurrentHashMap<String, String> stateStore = new ConcurrentHashMap<>();
    private static final long STATE_TTL_MS = 10 * 60 * 1000L; // 10 minutes

    private final GoogleOAuthProperties googleOAuthProperties;
    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final AuthService authService;
    private final RestTemplate restTemplate;

    // 定时清理过期 state 条目，防止内存泄漏
    private final java.util.concurrent.ScheduledExecutorService cleanupExecutor =
            java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "google-oauth-state-cleanup");
                t.setDaemon(true);
                return t;
            });

    public GoogleOAuthService(GoogleOAuthProperties googleOAuthProperties, UserRepository userRepository,
                              JwtService jwtService, AuthService authService, RestTemplate restTemplate) {
        this.googleOAuthProperties = googleOAuthProperties;
        this.userRepository = userRepository;
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
        String state = jwtService.generateSigningKey();
        stateStore.put(state, System.currentTimeMillis() + ",login,0");

        return GOOGLE_AUTH_URL
                + "?client_id=" + URLEncoder.encode(googleOAuthProperties.getClientId(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(googleOAuthProperties.getRedirectUri(), StandardCharsets.UTF_8)
                + "&scope=" + URLEncoder.encode(googleOAuthProperties.getScope(), StandardCharsets.UTF_8)
                + "&response_type=code"
                + "&state=" + URLEncoder.encode(state, StandardCharsets.UTF_8);
    }

    public String buildBindAuthorizationUrl(Long userId) {
        String state = jwtService.generateSigningKey();
        stateStore.put(state, System.currentTimeMillis() + ",bind," + userId);

        return GOOGLE_AUTH_URL
                + "?client_id=" + URLEncoder.encode(googleOAuthProperties.getClientId(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(googleOAuthProperties.getRedirectUri(), StandardCharsets.UTF_8)
                + "&scope=" + URLEncoder.encode(googleOAuthProperties.getScope(), StandardCharsets.UTF_8)
                + "&response_type=code"
                + "&state=" + URLEncoder.encode(state, StandardCharsets.UTF_8);
    }

    @Transactional
    public LoginResponse handleCallback(String code, String state, HttpServletResponse response) {
        // 验证 state 参数防止 CSRF
        if (state == null || state.isBlank()) {
            log.warn("Google OAuth callback missing state parameter");
            throw AuthException.loginFailed();
        }
        String stateData = stateStore.remove(state);
        if (stateData == null) {
            log.warn("Google OAuth callback invalid or expired state parameter");
            throw AuthException.loginFailed();
        }
        String[] stateParts = stateData.split(",");
        long stateCreatedAt = Long.parseLong(stateParts[0]);
        String mode = stateParts.length > 1 ? stateParts[1] : "login";
        long bindUserId = stateParts.length > 2 ? Long.parseLong(stateParts[2]) : 0;

        if (System.currentTimeMillis() - stateCreatedAt > STATE_TTL_MS) {
            log.warn("Google OAuth callback expired state parameter");
            throw AuthException.loginFailed();
        }

        // Exchange code for access token
        String accessToken = exchangeCodeForToken(code);

        // Fetch Google user profile
        GoogleUser googleUser = fetchGoogleUser(accessToken);

        // 绑定模式：将 Google 账号关联到已有用户
        if ("bind".equals(mode) && bindUserId > 0) {
            User user = userRepository.findById(bindUserId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
            if (user.getGoogleId() != null) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "已绑定 Google 账号", 400);
            }
            // 检查 Google 账号是否被其他用户绑定
            userRepository.findByGoogleId(googleUser.getSub())
                    .ifPresent(existingUser -> {
                        throw new BusinessException(ErrorCode.VALIDATION_FAILED, "该 Google 账号已被其他用户绑定", 400);
                    });
            user.setGoogleId(googleUser.getSub());
            user.setGoogleUsername(googleUser.getName());
            userRepository.save(user);
            // 绑定成功后返回 token
            String jwtAccessToken = jwtService.generateAccessToken(user.getId(), user.getUsername(), user.getRole().name());
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
                            .role(user.getRole().name())
                            .build())
                    .build();
        }

        // 登录模式：查找或创建用户
        User user;
        try {
            user = userRepository.findByGoogleId(googleUser.getSub())
                    .orElseGet(() -> createOAuthUser(googleUser));
        } catch (DataIntegrityViolationException e) {
            log.warn("Concurrent Google OAuth user creation, retrying find");
            user = userRepository.findByGoogleId(googleUser.getSub())
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
        String jwtAccessToken = jwtService.generateAccessToken(user.getId(), user.getUsername(), user.getRole().name());
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
                        .role(user.getRole().name())
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
                body.add("client_id", googleOAuthProperties.getClientId());
                body.add("client_secret", googleOAuthProperties.getClientSecret());
                body.add("code", code);
                body.add("redirect_uri", googleOAuthProperties.getRedirectUri());
                body.add("grant_type", "authorization_code");

                HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);

                ResponseEntity<Map> apiResponse = restTemplate.postForEntity(GOOGLE_TOKEN_URL, request, Map.class);

                if (apiResponse.getBody() == null || apiResponse.getBody().containsKey("error")) {
                    log.error("Google OAuth token exchange failed: {}", apiResponse.getBody());
                    throw AuthException.loginFailed();
                }

                return (String) apiResponse.getBody().get("access_token");
            } catch (HttpClientErrorException | HttpServerErrorException e) {
                log.error("Google OAuth token exchange HTTP error: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
                throw AuthException.loginFailed();
            } catch (RestClientException e) {
                // 网络抖动（代理不稳定等），重试
                lastException = e;
                if (attempt < 3) {
                    log.warn("Google OAuth token exchange attempt {}/3 failed, retrying...", attempt, e);
                    try { Thread.sleep(1000L * attempt); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        lastException = new RuntimeException("OAuth token exchange interrupted", ie);
                        break;
                    }
                }
            }
        }

        log.error("Google OAuth token exchange failed after 3 attempts", lastException);
        throw AuthException.loginFailed();
    }

    private GoogleUser fetchGoogleUser(String accessToken) {
        RuntimeException lastException = null;

        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(accessToken);

                HttpEntity<Void> request = new HttpEntity<>(headers);

                ResponseEntity<GoogleUser> apiResponse = restTemplate.exchange(
                        GOOGLE_USER_URL, HttpMethod.GET, request, GoogleUser.class);

                if (apiResponse.getBody() == null) {
                    throw AuthException.loginFailed();
                }

                return apiResponse.getBody();
            } catch (HttpClientErrorException | HttpServerErrorException e) {
                log.error("Google OAuth fetch user HTTP error: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
                throw AuthException.loginFailed();
            } catch (RestClientException e) {
                // 网络抖动（代理不稳定等），重试
                lastException = e;
                if (attempt < 3) {
                    log.warn("Google OAuth fetch user attempt {}/3 failed, retrying...", attempt, e);
                    try { Thread.sleep(1000L * attempt); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        lastException = new RuntimeException("OAuth fetch user interrupted", ie);
                        break;
                    }
                }
            }
        }

        log.error("Google OAuth fetch user failed after 3 attempts", lastException);
        throw AuthException.loginFailed();
    }

    private User createOAuthUser(GoogleUser googleUser) {
        String username = generateUniqueUsername(googleUser.getName(), googleUser.getSub());

        User user = User.builder()
                .username(username)
                .googleId(googleUser.getSub())
                .googleUsername(googleUser.getName())
                .email(googleUser.getEmail())
                .role(User.Role.USER)
                .isEnabled(true)
                .mustChangePassword(false)
                .loginFailCount(0)
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();

        try {
            return userRepository.save(user);
        } catch (DataIntegrityViolationException e) {
            log.warn("Concurrent user creation for googleId={}, retrying find", googleUser.getSub());
            return userRepository.findByGoogleId(googleUser.getSub())
                    .orElseThrow(() -> new BusinessException(ErrorCode.SYSTEM_ERROR, "注册失败，请重试", 500));
        }
    }

    private String generateUniqueUsername(String displayName, String sub) {
        // 清洗显示名称：只保留字母数字和下划线
        String cleaned = displayName != null
                ? displayName.replaceAll("[^a-zA-Z0-9_]", "")
                : "";

        // 如果清洗后为空（纯中文名等），使用 google_ + sub 后6位
        String base;
        if (cleaned.isEmpty()) {
            String suffix = sub.length() >= 6 ? sub.substring(sub.length() - 6) : sub;
            base = "google_" + suffix;
        } else {
            base = cleaned.length() > 20 ? cleaned.substring(0, 20) : cleaned;
        }

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
