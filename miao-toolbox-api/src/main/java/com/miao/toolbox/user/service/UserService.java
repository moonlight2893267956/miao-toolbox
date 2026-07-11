package com.miao.toolbox.user.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.oauth.GitHubOAuthService;
import com.miao.toolbox.auth.oauth.GoogleOAuthService;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.user.dto.UserInfoResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Service
@RequiredArgsConstructor
public class UserService {

    /** 用户名格式：3-20 位字母、数字、下划线（与 UpdateProfileRequest @Pattern 保持一致） */
    static final String USERNAME_PATTERN = "^[a-zA-Z0-9_]{3,20}$";

    private final UserRepository userRepository;
    private final GitHubOAuthService gitHubOAuthService;
    private final GoogleOAuthService googleOAuthService;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Transactional(readOnly = true)
    public UserInfoResponse getCurrentUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        return toUserInfoResponse(user);
    }

    @Transactional
    public UserInfoResponse updateProfile(Long userId, String username) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        String normalizedUsername = username == null ? "" : username.trim();
        if (!normalizedUsername.matches(USERNAME_PATTERN)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "用户名只能包含3-20位字母、数字和下划线", 400);
        }
        if (Objects.equals(user.getUsername(), normalizedUsername)) {
            return toUserInfoResponse(user);
        }
        userRepository.findByUsername(normalizedUsername)
                .filter(existing -> !Objects.equals(existing.getId(), userId))
                .ifPresent(existing -> {
                    throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, "用户名已存在", 409);
                });
        user.setUsername(normalizedUsername);
        try {
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS, "用户名已存在", 409);
        }
        return toUserInfoResponse(user);
    }

    private UserInfoResponse toUserInfoResponse(User user) {
        return UserInfoResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .roles(user.toRoleBriefs())
                .githubId(user.getGithubId())
                .githubUsername(user.getGithubUsername())
                .googleId(user.getGoogleId())
                .googleUsername(user.getGoogleUsername())
                .mustChangePassword(user.needsPasswordSetup())
                .build();
    }

    public String getBindGithubUrl(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        if (user.getGithubId() != null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "已绑定 GitHub 账号", 400);
        }
        return gitHubOAuthService.buildBindAuthorizationUrl(userId);
    }

    public String getBindGoogleUrl(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        if (user.getGoogleId() != null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "已绑定 Google 账号", 400);
        }
        return googleOAuthService.buildBindAuthorizationUrl(userId);
    }

    @Transactional
    public void unbindGithub(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        if (user.getGithubId() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "未绑定 GitHub 账号", 400);
        }
        user.setGithubId(null);
        user.setGithubUsername(null);
        userRepository.save(user);
    }

    @Transactional
    public void unbindGoogle(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        if (user.getGoogleId() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "未绑定 Google 账号", 400);
        }
        user.setGoogleId(null);
        user.setGoogleUsername(null);
        userRepository.save(user);
    }

    @Transactional
    public void changePassword(Long userId, String oldPassword, String newPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        if (user.getPasswordHash() == null || !passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.AUTH_LOGIN_FAILED, "旧密码不正确", 400);
        }
        if (!isValidPassword(newPassword)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "密码须包含字母和数字，且不少于8位", 400);
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
}
