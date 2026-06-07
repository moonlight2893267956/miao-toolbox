package com.miao.toolbox.auth.oauth;

import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.auth.service.AuthService;
import com.miao.toolbox.auth.service.JwtService;
import com.miao.toolbox.common.exception.AuthException;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class GitHubOAuthService {

    private static final String GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
    private static final String GITHUB_USER_URL = "https://api.github.com/user";

    private final OAuthProperties oAuthProperties;
    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final AuthService authService;
    private final RestTemplate restTemplate;

    public String buildAuthorizationUrl() {
        return "https://github.com/login/oauth/authorize"
                + "?client_id=" + oAuthProperties.getClientId()
                + "&redirect_uri=" + oAuthProperties.getRedirectUri()
                + "&scope=" + oAuthProperties.getScope()
                + "&state=" + jwtService.generateSigningKey();
    }

    @Transactional
    public LoginResponse handleCallback(String code, HttpServletResponse response) {
        // Exchange code for access token
        String accessToken = exchangeCodeForToken(code);

        // Fetch GitHub user profile
        GitHubUser githubUser = fetchGitHubUser(accessToken);

        // Find or create user
        User user = userRepository.findByGithubId(String.valueOf(githubUser.getId()))
                .orElseGet(() -> createOAuthUser(githubUser));

        if (!user.getIsEnabled()) {
            throw AuthException.userDisabled();
        }

        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw AuthException.userLocked();
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
                .user(LoginResponse.UserInfo.builder()
                        .id(user.getId())
                        .username(user.getUsername())
                        .role(user.getRole().name())
                        .build())
                .build();
    }

    private String exchangeCodeForToken(String code) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Accept", "application/json");
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id", oAuthProperties.getClientId());
        body.add("client_secret", oAuthProperties.getClientSecret());
        body.add("code", code);
        body.add("redirect_uri", oAuthProperties.getRedirectUri());

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);

        ResponseEntity<Map> response = restTemplate.postForEntity(GITHUB_TOKEN_URL, request, Map.class);

        if (response.getBody() == null || response.getBody().containsKey("error")) {
            log.error("GitHub OAuth token exchange failed: {}", response.getBody());
            throw AuthException.loginFailed();
        }

        return (String) response.getBody().get("access_token");
    }

    private GitHubUser fetchGitHubUser(String accessToken) {
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
    }

    private User createOAuthUser(GitHubUser githubUser) {
        String username = generateUniqueUsername(githubUser.getLogin());

        User user = User.builder()
                .username(username)
                .githubId(String.valueOf(githubUser.getId()))
                .email(githubUser.getEmail())
                .role(User.Role.USER)
                .isEnabled(true)
                .loginFailCount(0)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        return userRepository.save(user);
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
