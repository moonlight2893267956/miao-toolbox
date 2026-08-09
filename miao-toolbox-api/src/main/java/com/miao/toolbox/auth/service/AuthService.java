package com.miao.toolbox.auth.service;

import com.miao.toolbox.auth.dto.EmailRegisterRequest;
import com.miao.toolbox.auth.dto.LoginRequest;
import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.dto.RegisterRequest;
import com.miao.toolbox.auth.enums.EmailCodePurpose;
import com.miao.toolbox.auth.entity.RefreshToken;
import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.RefreshTokenRepository;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.invite.service.InviteService;
import com.miao.toolbox.common.constant.RedisKey;
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.storage.config.StorageProperties;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
public class AuthService {

    private static final int MAX_LOGIN_FAIL_COUNT = 5;
    private static final int LOCK_DURATION_MINUTES = 15;
    private static final int MAX_CONCURRENT_SESSIONS = 5;
    private static final String REFRESH_TOKEN_COOKIE_NAME = "refreshToken";
    private static final int SIGNING_KEY_TRANSITION_SECONDS = 30;

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final RoleRepository roleRepository;
    private final JwtService jwtService;
    private final InviteService inviteService;
    private final EmailCodeService emailCodeService;
    private final StorageProperties storageProperties;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;

    @Value("${miao.security.cookie-secure:false}")
    private boolean cookieSecure;

    public AuthService(UserRepository userRepository, RefreshTokenRepository refreshTokenRepository,
                       RoleRepository roleRepository, JwtService jwtService, InviteService inviteService,
                       EmailCodeService emailCodeService, StorageProperties storageProperties) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.roleRepository = roleRepository;
        this.jwtService = jwtService;
        this.inviteService = inviteService;
        this.emailCodeService = emailCodeService;
        this.storageProperties = storageProperties;
    }

    @Transactional
    public void register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, "用户名已存在", 409);
        }

        if (!isValidPassword(request.getPassword())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "密码须包含字母和数字，且不少于8位", 400);
        }

        Role userRole = roleRepository.findByCode("USER")
                .orElseThrow(() -> new BusinessException(ErrorCode.SYSTEM_ERROR, "系统角色配置异常", 500));

        // 携带有效邀请令牌时，用户自动获得对应角色；否则使用默认 USER 角色
        Role assignedRole = userRole;
        if (request.getInviteToken() != null && !request.getInviteToken().isBlank()) {
            Role inviteRole = inviteService.resolveRole(request.getInviteToken());
            if (inviteRole != null) {
                assignedRole = inviteRole;
            }
        }

        User user = User.builder()
                .username(request.getUsername())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .emailVerified(false)
                .roles(Set.of(assignedRole))
                .isEnabled(true)
                .mustChangePassword(false)
                .loginFailCount(0)
                .storageQuotaBytes(storageProperties.getDefaultQuotaBytes())
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();

        userRepository.save(user);
    }

    /**
     * 邮箱注册：验证码校验通过后创建用户并自动登录
     */
    @Transactional
    public LoginResponse emailRegister(EmailRegisterRequest request, HttpServletResponse response) {
        // 1. 校验验证码
        boolean verified = emailCodeService.verifyCode(request.getEmail(), request.getCode(), EmailCodePurpose.REGISTER);
        if (!verified) {
            throw new BusinessException(ErrorCode.EMAIL_CODE_INVALID, "验证码错误", 400);
        }

        // 2. 用户名唯一性校验
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, "用户名已存在", 409);
        }

        // 3. 邮箱已被已验证用户绑定
        if (userRepository.findByEmailAndEmailVerifiedTrue(request.getEmail()).isPresent()) {
            throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, "该邮箱已被注册", 409);
        }

        // 4. 密码校验
        if (!isValidPassword(request.getPassword())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "密码须包含字母和数字，且不少于8位", 400);
        }

        // 5. 角色分配
        Role userRole = roleRepository.findByCode("USER")
                .orElseThrow(() -> new BusinessException(ErrorCode.SYSTEM_ERROR, "系统角色配置异常", 500));
        Role assignedRole = userRole;
        if (request.getInviteToken() != null && !request.getInviteToken().isBlank()) {
            Role inviteRole = inviteService.resolveRole(request.getInviteToken());
            if (inviteRole != null) {
                assignedRole = inviteRole;
            }
        }

        // 6. 创建用户（email_verified = true）
        User user = User.builder()
                .username(request.getUsername())
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .emailVerified(true)
                .roles(Set.of(assignedRole))
                .isEnabled(true)
                .mustChangePassword(false)
                .loginFailCount(0)
                .storageQuotaBytes(storageProperties.getDefaultQuotaBytes())
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();
        userRepository.save(user);

        // 7. 自动登录
        String signingKey = jwtService.generateSigningKey();
        user.setSigningKey(signingKey);
        user.setLastLoginAt(LocalDateTime.now(ZoneOffset.UTC));
        userRepository.save(user);

        String accessToken = jwtService.generateAccessToken(user.getId(), user.getUsername(), user.getRoleCodes());
        String refreshToken = jwtService.generateRefreshToken(user.getId());
        storeRefreshToken(user.getId(), refreshToken);
        addRefreshTokenCookie(response, refreshToken);

        return LoginResponse.builder()
                .accessToken(accessToken)
                .signingKey(signingKey)
                .mustChangePassword(false)
                .user(LoginResponse.UserInfo.builder()
                        .id(user.getId())
                        .username(user.getUsername())
                        .avatarUrl(user.getAvatarUrl())
                        .roles(user.toRoleBriefs())
                        .build())
                .build();
    }

    @Transactional
    public LoginResponse login(LoginRequest request, HttpServletResponse response) {
        // 支持用户名或邮箱登录：输入包含 @ 视为邮箱
        User user;
        if (request.getUsername().contains("@")) {
            user = userRepository.findByEmailAndEmailVerifiedTrue(request.getUsername())
                    .orElseThrow(AuthException::loginFailed);
        } else {
            user = userRepository.findByUsername(request.getUsername())
                    .orElseThrow(AuthException::loginFailed);
        }

        // Check if account is locked
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now(ZoneOffset.UTC))) {
            throw AuthException.loginFailed(); // #8: 统一返回登录失败，避免用户枚举
        }

        // Check if account is disabled
        if (!user.getIsEnabled()) {
            throw AuthException.loginFailed(); // #8: 统一返回登录失败，避免用户枚举
        }

        // Verify password
        if (user.getPasswordHash() == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            handleLoginFailure(user);
            throw AuthException.loginFailed();
        }

        // Reset fail count on successful login
        user.setLoginFailCount(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(LocalDateTime.now(ZoneOffset.UTC));

        // Generate signing key
        String signingKey = jwtService.generateSigningKey();
        user.setSigningKey(signingKey);
        userRepository.save(user);

        // Generate tokens
        String accessToken = jwtService.generateAccessToken(user.getId(), user.getUsername(), user.getRoleCodes());
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        // Store refresh token hash
        storeRefreshToken(user.getId(), refreshToken);

        // Set refresh token as httpOnly cookie
        addRefreshTokenCookie(response, refreshToken);

        return LoginResponse.builder()
                .accessToken(accessToken)
                .signingKey(signingKey)
                .mustChangePassword(user.needsPasswordSetup())
                .user(LoginResponse.UserInfo.builder()
                        .id(user.getId())
                        .username(user.getUsername())
                        .avatarUrl(user.getAvatarUrl())
                        .roles(user.toRoleBriefs())
                        .build())
                .build();
    }

    @Transactional
    public LoginResponse refresh(String refreshTokenValue, HttpServletResponse response) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            throw AuthException.tokenExpired();
        }

        Claims claims = jwtService.validateRefreshToken(refreshTokenValue);
        if (claims == null) {
            throw AuthException.tokenExpired();
        }

        String tokenHash = hashToken(refreshTokenValue);
        RefreshToken storedToken = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(AuthException::tokenExpired);

        if (storedToken.getExpiresAt().isBefore(LocalDateTime.now(ZoneOffset.UTC))) {
            refreshTokenRepository.delete(storedToken);
            throw AuthException.tokenExpired();
        }

        Long userId = storedToken.getUserId();
        User user = userRepository.findById(userId)
                .orElseThrow(AuthException::tokenExpired);

        if (!user.getIsEnabled()) {
            throw AuthException.tokenExpired();
        }

        // Rotate: delete old token
        refreshTokenRepository.delete(storedToken);

        // Generate new tokens
        String newAccessToken = jwtService.generateAccessToken(user.getId(), user.getUsername(), user.getRoleCodes());
        String newRefreshToken = jwtService.generateRefreshToken(user.getId());

        // #19: Generate new signing key with transition period
        String oldSigningKey = user.getSigningKey();
        String newSigningKey = jwtService.generateSigningKey();
        user.setSigningKey(newSigningKey);
        userRepository.save(user);

        // Store old signing key in Redis for 30-second transition
        // Forward mapping: oldKey -> newKey (for finding which key replaced the old one)
        // Reverse mapping: newKey -> oldKey (for AntiReplayFilter to verify requests using old key)
        if (oldSigningKey != null && redisTemplate != null) {
            String forwardKey = RedisKey.SIGNING_KEY_TRANSITION_PREFIX + oldSigningKey;
            String reverseKey = RedisKey.SIGNING_KEY_TRANSITION_PREFIX + newSigningKey;
            redisTemplate.opsForValue().set(forwardKey, newSigningKey, Duration.ofSeconds(SIGNING_KEY_TRANSITION_SECONDS));
            redisTemplate.opsForValue().set(reverseKey, oldSigningKey, Duration.ofSeconds(SIGNING_KEY_TRANSITION_SECONDS));
        } else if (oldSigningKey != null) {
            log.warn("Redis unavailable, skipping signing key transition storage. In-flight requests may fail during transition window.");
        }

        // Store new refresh token
        storeRefreshToken(user.getId(), newRefreshToken);

        // Set new refresh token cookie
        addRefreshTokenCookie(response, newRefreshToken);

        return LoginResponse.builder()
                .accessToken(newAccessToken)
                .signingKey(newSigningKey)
                .mustChangePassword(user.needsPasswordSetup())
                .user(LoginResponse.UserInfo.builder()
                        .id(user.getId())
                        .username(user.getUsername())
                        .avatarUrl(user.getAvatarUrl())
                        .roles(user.toRoleBriefs())
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
        int currentCount = user.getLoginFailCount() != null ? user.getLoginFailCount() : 0;
        user.setLoginFailCount(currentCount + 1);
        if (currentCount + 1 >= MAX_LOGIN_FAIL_COUNT) {
            user.setLockedUntil(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(LOCK_DURATION_MINUTES));
        }
        userRepository.save(user);
    }

    public void storeRefreshToken(Long userId, String rawToken) {
        // #5: Enforce max concurrent sessions with pessimistic approach
        List<RefreshToken> existingTokens = refreshTokenRepository.findByUserIdOrderByCreatedAtAsc(userId);
        while (existingTokens.size() >= MAX_CONCURRENT_SESSIONS) {
            refreshTokenRepository.delete(existingTokens.removeFirst());
        }

        String tokenHash = hashToken(rawToken);
        LocalDateTime expiresAt = LocalDateTime.now(ZoneOffset.UTC).plusSeconds(jwtService.getRefreshTokenExpiryMs() / 1000);

        RefreshToken refreshToken = RefreshToken.builder()
                .tokenHash(tokenHash)
                .userId(userId)
                .expiresAt(expiresAt)
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
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

    public void changePassword(Long userId, String newPassword) {
        if (!isValidPassword(newPassword)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "密码须包含字母和数字，且不少于8位", 400);
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setMustChangePassword(false);
        userRepository.save(user);
    }

    public void changePasswordWithVerification(Long userId, String oldPassword, String newPassword) {
        if (!isValidPassword(newPassword)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "密码须包含字母和数字，且不少于8位", 400);
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        if (user.getPasswordHash() == null || !passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.AUTH_LOGIN_FAILED, "旧密码不正确", 400);
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setMustChangePassword(false);
        userRepository.save(user);
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

    /**
     * 邮箱重置密码：校验验证码 → 更新密码 → 清除所有 refresh token（强制重新登录）
     */
    @Transactional
    public void resetPassword(String email, String code, String newPassword) {
        // 1. 校验验证码
        boolean verified = emailCodeService.verifyCode(email, code, EmailCodePurpose.RESET_PASSWORD);
        if (!verified) {
            throw new BusinessException(ErrorCode.EMAIL_CODE_INVALID, "验证码错误", 400);
        }

        // 2. 查找已验证邮箱对应的用户
        User user = userRepository.findByEmailAndEmailVerifiedTrue(email)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "该邮箱未注册", 404));

        // 3. 密码格式校验
        if (!isValidPassword(newPassword)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "密码须包含字母和数字，且不少于8位", 400);
        }

        // 4. 更新密码
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setMustChangePassword(false);
        userRepository.save(user);

        // 5. 清除所有 refresh token，强制重新登录
        List<RefreshToken> tokens = refreshTokenRepository.findByUserIdOrderByCreatedAtAsc(user.getId());
        refreshTokenRepository.deleteAll(tokens);
    }

    public void addRefreshTokenCookie(HttpServletResponse response, String token) {
        Cookie cookie = new Cookie(REFRESH_TOKEN_COOKIE_NAME, token);
        cookie.setHttpOnly(true);
        cookie.setPath("/api/auth");
        cookie.setMaxAge((int) (jwtService.getRefreshTokenExpiryMs() / 1000));
        // #25: 生产环境设置 Secure + SameSite=None
        if (cookieSecure) {
            cookie.setSecure(true);
            cookie.setAttribute("SameSite", "None");
        } else {
            cookie.setAttribute("SameSite", "Lax");
        }
        response.addCookie(cookie);
    }

    public void clearRefreshTokenCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie(REFRESH_TOKEN_COOKIE_NAME, "");
        cookie.setHttpOnly(true);
        cookie.setPath("/api/auth");
        cookie.setMaxAge(0);
        if (cookieSecure) {
            cookie.setSecure(true);
            cookie.setAttribute("SameSite", "None");
        } else {
            cookie.setAttribute("SameSite", "Lax");
        }
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
