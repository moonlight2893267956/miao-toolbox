package com.miao.toolbox.invite.service;

import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.invite.dto.InvitePreviewResponse;
import com.miao.toolbox.invite.dto.InviteResponse;
import com.miao.toolbox.invite.entity.InviteToken;
import com.miao.toolbox.invite.repository.InviteTokenRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class InviteService {

    public static final int DEFAULT_EXPIRES_DAYS = 7;
    public static final int MAX_EXPIRES_DAYS = 365;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final InviteTokenRepository inviteTokenRepository;
    private final RoleRepository roleRepository;

    @Transactional
    public InviteResponse createInvite(Long roleId, Long createdBy, Integer expiresInDays) {
        Role role = roleRepository.findById(roleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROLE_NOT_FOUND, "角色不存在", 404));
        if (Boolean.TRUE.equals(role.getIsSystem())) {
            throw new BusinessException(
                    ErrorCode.INVITE_ROLE_NOT_INVITABLE, "系统内置角色不可生成邀请链接", 422);
        }

        int days = expiresInDays != null && expiresInDays > 0
                ? Math.min(expiresInDays, MAX_EXPIRES_DAYS)
                : DEFAULT_EXPIRES_DAYS;

        String rawToken = generateRawToken();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        InviteToken token = InviteToken.builder()
                .roleId(role.getId())
                .tokenHash(hashToken(rawToken))
                .createdBy(createdBy)
                .expiresAt(now.plusDays(days))
                .createdAt(now)
                .build();
        inviteTokenRepository.save(token);

        return InviteResponse.builder()
                .token(rawToken)
                .roleId(role.getId())
                .roleName(role.getName())
                .roleCode(role.getCode())
                .expiresAt(token.getExpiresAt())
                .build();
    }

    /** 解析邀请令牌对应的角色；令牌为空时返回 null（表示走默认注册流程）。 */
    public Role resolveRole(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return null;
        }
        InviteToken token = inviteTokenRepository.findByTokenHash(hashToken(rawToken))
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.INVITE_TOKEN_INVALID, "邀请链接无效或不存在", 400));
        if (token.getExpiresAt().isBefore(LocalDateTime.now(ZoneOffset.UTC))) {
            throw new BusinessException(ErrorCode.INVITE_TOKEN_EXPIRED, "邀请链接已过期", 400);
        }
        return roleRepository.findById(token.getRoleId())
                .orElseThrow(() -> new BusinessException(ErrorCode.ROLE_NOT_FOUND, "邀请角色不存在", 404));
    }

    /** 公开预览：不抛异常，仅返回是否有效及角色名。 */
    public InvitePreviewResponse preview(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return InvitePreviewResponse.invalid();
        }
        Optional<InviteToken> opt = inviteTokenRepository.findByTokenHash(hashToken(rawToken));
        if (opt.isEmpty()) {
            return InvitePreviewResponse.invalid();
        }
        InviteToken token = opt.get();
        if (token.getExpiresAt().isBefore(LocalDateTime.now(ZoneOffset.UTC))) {
            return InvitePreviewResponse.invalid();
        }
        return roleRepository.findById(token.getRoleId())
                .map(role -> InvitePreviewResponse.valid(role.getName()))
                .orElse(InvitePreviewResponse.invalid());
    }

    private String generateRawToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
