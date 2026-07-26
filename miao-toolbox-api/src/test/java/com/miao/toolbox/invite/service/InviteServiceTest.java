package com.miao.toolbox.invite.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("InviteService 单元测试")
class InviteServiceTest {

    @Mock private InviteTokenRepository inviteTokenRepository;
    @Mock private RoleRepository roleRepository;

    @InjectMocks private InviteService inviteService;

    private Role customRole;
    private Role systemRole;

    @BeforeEach
    void setUp() {
        customRole = Role.builder().id(5L).code("EDITOR").name("编辑").isSystem(false).build();
        systemRole = Role.builder().id(1L).code("SUPER_ADMIN").name("超级管理员").isSystem(true).build();
    }

    private String hash(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    @DisplayName("createInvite_自定义角色_生成令牌并返回原文")
    void createInvite_customRole_success() {
        when(roleRepository.findById(5L)).thenReturn(Optional.of(customRole));
        when(inviteTokenRepository.save(any(InviteToken.class))).thenAnswer(inv -> inv.getArgument(0));

        InviteResponse resp = inviteService.createInvite(5L, 1L, 7);

        assertThat(resp.getToken()).isNotBlank();
        assertThat(resp.getRoleName()).isEqualTo("编辑");
        assertThat(resp.getExpiresAt()).isAfter(LocalDateTime.now(ZoneOffset.UTC));

        ArgumentCaptor<InviteToken> captor = ArgumentCaptor.forClass(InviteToken.class);
        verify(inviteTokenRepository).save(captor.capture());
        // 库中只存哈希，且哈希与原文一致
        assertThat(captor.getValue().getTokenHash()).isEqualTo(hash(resp.getToken()));
        assertThat(captor.getValue().getRoleId()).isEqualTo(5L);
        assertThat(captor.getValue().getCreatedBy()).isEqualTo(1L);
    }

    @Test
    @DisplayName("createInvite_缺省有效期_使用默认7天")
    void createInvite_defaultExpiry() {
        when(roleRepository.findById(5L)).thenReturn(Optional.of(customRole));
        when(inviteTokenRepository.save(any(InviteToken.class))).thenAnswer(inv -> inv.getArgument(0));

        InviteResponse resp = inviteService.createInvite(5L, 1L, null);

        assertThat(resp.getExpiresAt()).isBetween(
                LocalDateTime.now(ZoneOffset.UTC).plusDays(6),
                LocalDateTime.now(ZoneOffset.UTC).plusDays(8));
    }

    @Test
    @DisplayName("createInvite_系统角色_抛出不可邀请异常")
    void createInvite_systemRole_throws() {
        when(roleRepository.findById(1L)).thenReturn(Optional.of(systemRole));

        assertThatThrownBy(() -> inviteService.createInvite(1L, 1L, 7))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVITE_ROLE_NOT_INVITABLE);
        verify(inviteTokenRepository, never()).save(any());
    }

    @Test
    @DisplayName("createInvite_角色不存在_抛出角色未找到异常")
    void createInvite_roleNotFound_throws() {
        when(roleRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> inviteService.createInvite(99L, 1L, 7))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.ROLE_NOT_FOUND);
    }

    @Test
    @DisplayName("resolveRole_令牌为空_返回 null（走默认注册）")
    void resolveRole_blankToken_returnsNull() {
        assertThat(inviteService.resolveRole(null)).isNull();
        assertThat(inviteService.resolveRole("  ")).isNull();
    }

    @Test
    @DisplayName("resolveRole_有效令牌_返回对应角色")
    void resolveRole_validToken_returnsRole() {
        String raw = "raw-token-abc";
        InviteToken token = InviteToken.builder()
                .id(1L).roleId(5L).tokenHash(hash(raw))
                .createdBy(1L).expiresAt(LocalDateTime.now(ZoneOffset.UTC).plusDays(1))
                .createdAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        when(inviteTokenRepository.findByTokenHash(hash(raw))).thenReturn(Optional.of(token));
        when(roleRepository.findById(5L)).thenReturn(Optional.of(customRole));

        Role resolved = inviteService.resolveRole(raw);
        assertThat(resolved).isEqualTo(customRole);
    }

    @Test
    @DisplayName("resolveRole_令牌无效_抛出异常")
    void resolveRole_invalidToken_throws() {
        when(inviteTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> inviteService.resolveRole("unknown"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVITE_TOKEN_INVALID);
    }

    @Test
    @DisplayName("resolveRole_令牌过期_抛出异常")
    void resolveRole_expiredToken_throws() {
        String raw = "expired-token";
        InviteToken token = InviteToken.builder()
                .id(2L).roleId(5L).tokenHash(hash(raw))
                .createdBy(1L).expiresAt(LocalDateTime.now(ZoneOffset.UTC).minusHours(1))
                .createdAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        when(inviteTokenRepository.findByTokenHash(hash(raw))).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> inviteService.resolveRole(raw))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVITE_TOKEN_EXPIRED);
    }

    @Test
    @DisplayName("preview_有效令牌_返回 valid 与角色名")
    void preview_validToken() {
        String raw = "preview-token";
        InviteToken token = InviteToken.builder()
                .id(3L).roleId(5L).tokenHash(hash(raw))
                .createdBy(1L).expiresAt(LocalDateTime.now(ZoneOffset.UTC).plusDays(1))
                .createdAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        when(inviteTokenRepository.findByTokenHash(hash(raw))).thenReturn(Optional.of(token));
        when(roleRepository.findById(5L)).thenReturn(Optional.of(customRole));

        InvitePreviewResponse resp = inviteService.preview(raw);
        assertThat(resp.isValid()).isTrue();
        assertThat(resp.getRoleName()).isEqualTo("编辑");
    }

    @Test
    @DisplayName("preview_无效或过期令牌_返回 invalid 且不抛异常")
    void preview_invalidOrExpired() {
        assertThat(inviteService.preview("").isValid()).isFalse();
        assertThat(inviteService.preview(null).isValid()).isFalse();

        String raw = "expired-preview";
        InviteToken token = InviteToken.builder()
                .id(4L).roleId(5L).tokenHash(hash(raw))
                .createdBy(1L).expiresAt(LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1))
                .createdAt(LocalDateTime.now(ZoneOffset.UTC)).build();
        when(inviteTokenRepository.findByTokenHash(hash(raw))).thenReturn(Optional.of(token));

        assertThat(inviteService.preview(raw).isValid()).isFalse();
    }
}
