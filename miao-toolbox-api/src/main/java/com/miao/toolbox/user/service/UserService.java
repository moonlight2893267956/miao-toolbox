package com.miao.toolbox.user.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.oauth.GitHubOAuthService;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.user.dto.UserInfoResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final GitHubOAuthService gitHubOAuthService;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public UserInfoResponse getCurrentUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        return UserInfoResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .role(user.getRole().name())
                .githubId(user.getGithubId())
                .githubUsername(user.getGithubUsername())
                .mustChangePassword(Boolean.TRUE.equals(user.getMustChangePassword()))
                .build();
    }

    public String getBindGithubUrl(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
        if (user.getGithubId() != null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "已绑定 GitHub 账号", 400);
        }
        // 返回完整的 GitHub OAuth URL（含 state + userId 编码），前端直接跳转此 URL
        return gitHubOAuthService.buildBindAuthorizationUrl(userId);
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