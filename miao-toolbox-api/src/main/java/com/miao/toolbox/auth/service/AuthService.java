package com.miao.toolbox.auth.service;

import com.miao.toolbox.auth.dto.LoginRequest;
import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.dto.RegisterRequest;
import com.miao.toolbox.auth.entity.RefreshToken;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.RefreshTokenRepository;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final int MAX_LOGIN_FAIL_COUNT = 5;
    private static final int LOCK_DURATION_MINUTES = 15;
    private static final int MAX_CONCURRENT_SESSIONS = 5;
    private static final String REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Transactional
    public void register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, "用户名已存在", 409);
        }

        if (!isValidPassword(request.getPassword())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "密码须包含字母和数字，且不少于8位", 400);
        }

        User user = User.builder()
                .username(request.getUsername())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(User.Role.USER)
                .isEnabled(true)
                .loginFailCount(0)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        userRepository.save(user);
    }

    @Transactional
    public LoginResponse login(LoginRequest request, HttpServletResponse response) {
        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(AuthException::loginFailed);

        // Check if account is locked
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw AuthException.userLocked();
        }

        // Check if account is disabled
        if (!user.getIsEnabled()) {
            throw AuthException.userDisabled();
        }

        // Verify password
        if (user.getPasswordHash() == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            handleLoginFailure(user);
            throw AuthException.loginFailed();
        }

        // Reset fail count on successful login
        user.setLoginFailCount(0);
        user.setLockedUntil(null);

        // Generate signing key
        String signingKey = jwtService.generateSigningKey();
        user.setSigningKey(signingKey);
        userRepository.save(user);

        // Generate tokens
        String accessToken = jwtService.generateAccessToken(user.getId(), user.getUsername(), user.getRole().name());
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        // Store refresh token hash
        storeRefreshToken(user.getId(), refreshToken);

        // Set refresh token as httpOnly cookie
        addRefreshTokenCookie(response, refreshToken);

        return LoginResponse.builder()
                .accessToken(accessToken)
                .signingKey(signingKey)
                .user(LoginResponse.UserInfo.builder()
                        .id(user.getId())
                        .username(user.getUsername())
                        .role(user.getRole().name())
                        .build())
                .build();
    }

    @Transactional
    public LoginResponse refresh(String refreshTokenValue, HttpServletResponse response) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            throw AuthException.tokenExpired();
        }

        Claims claims = jwtService.validateToken(refreshTokenValue);
        if (claims == null) {
            throw AuthException.tokenExpired();
        }

        String tokenHash = hashToken(refreshTokenValue);
        RefreshToken storedToken = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(AuthException::tokenExpired);

        if (storedToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            refreshTokenRepository.delete(storedToken);
            throw AuthException.tokenExpired();
        }

        Long userId = storedToken.getUserId();
        User user = userRepository.findById(userId)
                .orElseThrow(AuthException::tokenExpired);

        if (!user.getIsEnabled()) {
            throw AuthException.userDisabled();
        }

        // Rotate: delete old token
        refreshTokenRepository.delete(storedToken);

        // Generate new tokens
        String newAccessToken = jwtService.generateAccessToken(user.getId(), user.getUsername(), user.getRole().name());
        String newRefreshToken = jwtService.generateRefreshToken(user.getId());

        // Generate new signing key
        String oldSigningKey = user.getSigningKey();
        String newSigningKey = jwtService.generateSigningKey();
        user.setSigningKey(newSigningKey);
        userRepository.save(user);

        // Store new refresh token
        storeRefreshToken(user.getId(), newRefreshToken);

        // Set new refresh token cookie
        addRefreshTokenCookie(response, newRefreshToken);

        return LoginResponse.builder()
                .accessToken(newAccessToken)
                .signingKey(newSigningKey)
                .user(LoginResponse.UserInfo.builder()
                        .id(user.getId())
                        .username(user.getUsername())
                        .role(user.getRole().name())
                        .build())
                .build();
    }

    @Transactional
    public void logout(String refreshTokenValue, HttpServletResponse response) {
        if (refreshTokenValue != null && !refreshTokenValue.isBlank()) {
            String tokenHash = hashToken(refreshTokenValue);
            refreshTokenRepository.findByTokenHash(tokenHash)
                    .ifPresent(refreshTokenRepository::delete);
        }
        clearRefreshTokenCookie(response);
    }

    public User getUserById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
    }

    private void handleLoginFailure(User user) {
        user.setLoginFailCount(user.getLoginFailCount() + 1);
        if (user.getLoginFailCount() >= MAX_LOGIN_FAIL_COUNT) {
            user.setLockedUntil(LocalDateTime.now().plusMinutes(LOCK_DURATION_MINUTES));
        }
        userRepository.save(user);
    }

    private void storeRefreshToken(Long userId, String rawToken) {
        // Enforce max concurrent sessions
        List<RefreshToken> existingTokens = refreshTokenRepository.findByUserIdOrderByCreatedAtAsc(userId);
        while (existingTokens.size() >= MAX_CONCURRENT_SESSIONS) {
            refreshTokenRepository.delete(existingTokens.removeFirst());
        }

        String tokenHash = hashToken(rawToken);
        LocalDateTime expiresAt = LocalDateTime.now().plusSeconds(jwtService.getRefreshTokenExpiryMs() / 1000);

        RefreshToken refreshToken = RefreshToken.builder()
                .tokenHash(tokenHash)
                .userId(userId)
                .expiresAt(expiresAt)
                .createdAt(LocalDateTime.now())
                .build();

        refreshTokenRepository.save(refreshToken);
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }

    private boolean isValidPassword(String password) {
        if (password == null || password.length() < 8) return false;
        boolean hasLetter = false;
        boolean hasDigit = false;
        for (char c : password.toCharArray()) {
            if (Character.isLetter(c)) hasLetter = true;
            if (Character.isDigit(c)) hasDigit = true;
        }
        return hasLetter && hasDigit;
    }

    private void addRefreshTokenCookie(HttpServletResponse response, String token) {
        Cookie cookie = new Cookie(REFRESH_TOKEN_COOKIE_NAME, token);
        cookie.setHttpOnly(true);
        cookie.setPath("/api/auth");
        cookie.setMaxAge((int) (jwtService.getRefreshTokenExpiryMs() / 1000));
        // SameSite=Lax for dev; production should use SameSite=None + Secure
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);
    }

    private void clearRefreshTokenCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie(REFRESH_TOKEN_COOKIE_NAME, "");
        cookie.setHttpOnly(true);
        cookie.setPath("/api/auth");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
    }

    public String extractRefreshTokenFromCookie(jakarta.servlet.http.Cookie[] cookies) {
        if (cookies == null) return null;
        for (Cookie cookie : cookies) {
            if (REFRESH_TOKEN_COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
