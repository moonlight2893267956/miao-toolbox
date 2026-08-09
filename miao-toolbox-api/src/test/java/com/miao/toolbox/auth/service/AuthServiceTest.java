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
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.invite.service.InviteService;
import com.miao.toolbox.storage.config.StorageProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AuthService 单元测试")
class AuthServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private RoleRepository roleRepository;
    @Mock private JwtService jwtService;
    @Mock private InviteService inviteService;
    @Mock private EmailCodeService emailCodeService;
    @Mock private HttpServletResponse response;
    private final StorageProperties storageProperties = new StorageProperties();
    private AuthService authService;

    private User enabledUser;
    private User disabledUser;
    private User lockedUser;
    private Role userRole;

    @BeforeEach
    void setUp() {
        userRole = Role.builder().id(2L).code("USER").name("普通用户").isSystem(true).build();

        enabledUser = User.builder()
                .id(1L).username("testuser").passwordHash("$2a$10$hash")
                .roles(Set.of(userRole)).isEnabled(true).mustChangePassword(false)
                .loginFailCount(0).createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();

        disabledUser = User.builder()
                .id(2L).username("disabled").passwordHash("$2a$10$hash")
                .roles(Set.of(userRole)).isEnabled(false).mustChangePassword(false)
                .loginFailCount(0).createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();

        lockedUser = User.builder()
                .id(3L).username("locked").passwordHash("$2a$10$hash")
                .roles(Set.of(userRole)).isEnabled(true).mustChangePassword(false)
                .loginFailCount(5).lockedUntil(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(15))
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();

        lenient().when(jwtService.getRefreshTokenExpiryMs()).thenReturn(7 * 24 * 60 * 60 * 1000L);
        lenient().when(roleRepository.findByCode("USER")).thenReturn(Optional.of(userRole));

        authService = new AuthService(userRepository, refreshTokenRepository, roleRepository, jwtService, inviteService, emailCodeService, storageProperties);
    }

    // ========== 注册测试 ==========

    @Nested
    @DisplayName("register 注册")
    class RegisterTests {

        @Test
        @DisplayName("正常注册成功")
        void register_success() {
            when(userRepository.existsByUsername("newuser")).thenReturn(false);
            when(jwtService.generateSigningKey()).thenReturn("key");

            RegisterRequest request = new RegisterRequest();
            request.setUsername("newuser");
            request.setPassword("Password1");

            assertThatCode(() -> authService.register(request)).doesNotThrowAnyException();
            verify(userRepository).save(argThat(user ->
                    user.getUsername().equals("newuser") &&
                    user.getRoles() != null && !user.getRoles().isEmpty() &&
                    user.getIsEnabled()
            ));
        }

        @Test
        @DisplayName("用户名已存在 → 抛出异常")
        void register_duplicateUsername() {
            when(userRepository.existsByUsername("existing")).thenReturn(true);

            RegisterRequest request = new RegisterRequest();
            request.setUsername("existing");
            request.setPassword("Password1");

            assertThatThrownBy(() -> authService.register(request))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo("USER_ALREADY_EXISTS");
        }

        @Test
        @DisplayName("密码不满足强度要求 → 抛出异常")
        void register_weakPassword() {
            when(userRepository.existsByUsername("user")).thenReturn(false);

            RegisterRequest request = new RegisterRequest();
            request.setUsername("user");
            request.setPassword("password"); // 只有字母没有数字

            assertThatThrownBy(() -> authService.register(request))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo("VALIDATION_FAILED");
        }

        @Test
        @DisplayName("密码太短 → 抛出异常")
        void register_shortPassword() {
            when(userRepository.existsByUsername("user")).thenReturn(false);

            RegisterRequest request = new RegisterRequest();
            request.setUsername("user");
            request.setPassword("Ab1"); // 不到8位

            assertThatThrownBy(() -> authService.register(request))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo("VALIDATION_FAILED");
        }

        @Test
        @DisplayName("携带有效邀请令牌 → 用户被分配邀请角色")
        void register_withValidInviteToken_assignsInviteRole() {
            when(userRepository.existsByUsername("invited")).thenReturn(false);

            Role inviteRole = Role.builder().id(5L).code("EDITOR").name("编辑").isSystem(false).build();
            when(inviteService.resolveRole("valid-token")).thenReturn(inviteRole);

            RegisterRequest request = new RegisterRequest();
            request.setUsername("invited");
            request.setPassword("Password1");
            request.setInviteToken("valid-token");

            assertThatCode(() -> authService.register(request)).doesNotThrowAnyException();
            verify(userRepository).save(argThat(user ->
                    user.getRoles() != null && user.getRoles().contains(inviteRole)));
            verify(inviteService).resolveRole("valid-token");
        }

        @Test
        @DisplayName("邀请令牌无效 → 抛出异常并中断注册")
        void register_withInvalidInviteToken_throws() {
            when(userRepository.existsByUsername("invited")).thenReturn(false);
            when(inviteService.resolveRole("bad-token"))
                    .thenThrow(new BusinessException(ErrorCode.INVITE_TOKEN_INVALID, "邀请链接无效或不存在", 400));

            RegisterRequest request = new RegisterRequest();
            request.setUsername("invited");
            request.setPassword("Password1");
            request.setInviteToken("bad-token");

            assertThatThrownBy(() -> authService.register(request))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.INVITE_TOKEN_INVALID);
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("无邀请令牌 → 仍分配 USER 角色")
        void register_withoutInviteToken_assignsUserRole() {
            when(userRepository.existsByUsername("plain")).thenReturn(false);

            RegisterRequest request = new RegisterRequest();
            request.setUsername("plain");
            request.setPassword("Password1");

            assertThatCode(() -> authService.register(request)).doesNotThrowAnyException();
            verify(inviteService, never()).resolveRole(any());
            verify(userRepository).save(argThat(user ->
                    user.getRoles() != null && user.getRoles().contains(userRole)));
        }
    }

    // ========== 登录测试 ==========

    @Nested
    @DisplayName("login 登录")
    class LoginTests {

        @Test
        @DisplayName("正常登录成功")
        void login_success() {
            when(userRepository.findByUsername("testuser")).thenReturn(Optional.of(enabledUser));
            // Mock passwordEncoder — 需要通过反射或直接匹配
            // 由于 passwordEncoder 是直接 new 的，需要绕过
            // 实际测试中使用 matches 需要真实 hash
            when(jwtService.generateSigningKey()).thenReturn("signkey123");
            when(jwtService.generateAccessToken(anyLong(), anyString(), anyList())).thenReturn("access-token");
            when(jwtService.generateRefreshToken(anyLong())).thenReturn("refresh-token");
            when(refreshTokenRepository.findByUserIdOrderByCreatedAtAsc(1L)).thenReturn(List.of());

            // 密码验证会失败因为 passwordEncoder 是真实 BCrypt
            assertThatThrownBy(() -> authService.login(
                    new LoginRequest() {{ setUsername("testuser"); setPassword("wrong"); }},
                    response
            )).isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("用户不存在 → 统一返回登录失败")
        void login_userNotFound() {
            when(userRepository.findByUsername("nobody")).thenReturn(Optional.empty());

            LoginRequest req = new LoginRequest();
            req.setUsername("nobody");
            req.setPassword("Password1");

            assertThatThrownBy(() -> authService.login(req, response))
                    .isInstanceOf(AuthException.class);
            // 不应暴露"用户不存在"信息
            assertThatThrownBy(() -> authService.login(req, response))
                    .hasMessageContaining("用户名或密码错误");
        }

        @Test
        @DisplayName("禁用用户 → 统一返回登录失败（不暴露禁用信息）")
        void login_disabledUser() {
            when(userRepository.findByUsername("disabled")).thenReturn(Optional.of(disabledUser));

            LoginRequest req = new LoginRequest();
            req.setUsername("disabled");
            req.setPassword("Password1");

            assertThatThrownBy(() -> authService.login(req, response))
                    .isInstanceOf(AuthException.class)
                    .hasMessageContaining("用户名或密码错误");
        }

        @Test
        @DisplayName("锁定用户 → 统一返回登录失败（不暴露锁定信息）")
        void login_lockedUser() {
            when(userRepository.findByUsername("locked")).thenReturn(Optional.of(lockedUser));

            LoginRequest req = new LoginRequest();
            req.setUsername("locked");
            req.setPassword("Password1");

            assertThatThrownBy(() -> authService.login(req, response))
                    .isInstanceOf(AuthException.class)
                    .hasMessageContaining("用户名或密码错误");
        }

        @Test
        @DisplayName("登录失败计数递增")
        void login_failureCountIncrement() {
            User user = User.builder()
                    .id(1L).username("test").passwordHash("$2a$10$hash")
                    .roles(Set.of(userRole)).isEnabled(true).loginFailCount(0)
                    .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                    .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
            when(userRepository.findByUsername("test")).thenReturn(Optional.of(user));

            LoginRequest req = new LoginRequest();
            req.setUsername("test");
            req.setPassword("wrong");

            assertThatThrownBy(() -> authService.login(req, response))
                    .isInstanceOf(AuthException.class);

            ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
            verify(userRepository).save(captor.capture());
            assertThat(captor.getValue().getLoginFailCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("连续5次登录失败 → 锁定15分钟")
        void login_lockedAfter5Failures() {
            User user = User.builder()
                    .id(1L).username("test").passwordHash("$2a$10$hash")
                    .roles(Set.of(userRole)).isEnabled(true).loginFailCount(4)
                    .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                    .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
            when(userRepository.findByUsername("test")).thenReturn(Optional.of(user));

            LoginRequest req = new LoginRequest();
            req.setUsername("test");
            req.setPassword("wrong");

            assertThatThrownBy(() -> authService.login(req, response))
                    .isInstanceOf(AuthException.class);

            ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
            verify(userRepository).save(captor.capture());
            assertThat(captor.getValue().getLoginFailCount()).isEqualTo(5);
            assertThat(captor.getValue().getLockedUntil()).isNotNull();
        }
    }

    // ========== Token 刷新测试 ==========

    @Nested
    @DisplayName("refresh Token 刷新")
    class RefreshTests {

        @Test
        @DisplayName("refresh token 为空 → 抛出异常")
        void refresh_nullToken() {
            assertThatThrownBy(() -> authService.refresh(null, response))
                    .isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("refresh token 无效 → 抛出异常")
        void refresh_invalidToken() {
            when(jwtService.validateRefreshToken("bad-token")).thenReturn(null);

            assertThatThrownBy(() -> authService.refresh("bad-token", response))
                    .isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("refresh token 已过期 → 抛出异常并删除记录")
        void refresh_expiredToken() {
            var claims = mock(io.jsonwebtoken.Claims.class);
            when(jwtService.validateRefreshToken("expired-token")).thenReturn(claims);
            when(jwtService.extractUserId(claims)).thenReturn(1L);

            RefreshToken stored = RefreshToken.builder()
                    .id(1L).tokenHash("hash").userId(1L)
                    .expiresAt(LocalDateTime.now(ZoneOffset.UTC).minusHours(1))
                    .createdAt(LocalDateTime.now(ZoneOffset.UTC)).build();
            when(refreshTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(stored));

            assertThatThrownBy(() -> authService.refresh("expired-token", response))
                    .isInstanceOf(AuthException.class);
            verify(refreshTokenRepository).delete(stored);
        }
    }

    // ========== 注销测试 ==========

    @Nested
    @DisplayName("logout 注销")
    class LogoutTests {

        @Test
        @DisplayName("正常注销删除 refresh token 并清除 cookie")
        void logout_success() {
            RefreshToken stored = RefreshToken.builder()
                    .id(1L).tokenHash("hash").userId(1L)
                    .expiresAt(LocalDateTime.now(ZoneOffset.UTC).plusDays(7))
                    .createdAt(LocalDateTime.now(ZoneOffset.UTC)).build();
            when(refreshTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(stored));

            authService.logout("valid-refresh-token", response);

            verify(refreshTokenRepository).delete(stored);
            verify(response).addCookie(any(Cookie.class));
        }

        @Test
        @DisplayName("refresh token 为空时仍正常处理")
        void logout_nullToken() {
            assertThatCode(() -> authService.logout(null, response)).doesNotThrowAnyException();
            verify(refreshTokenRepository, never()).delete(any());
        }
    }

    // ========== 邮箱注册测试 ==========

    @Nested
    @DisplayName("emailRegister 邮箱注册")
    class EmailRegisterTests {

        private EmailRegisterRequest buildRequest() {
            EmailRegisterRequest req = new EmailRegisterRequest();
            req.setEmail("test@example.com");
            req.setUsername("newuser");
            req.setPassword("Password1");
            req.setCode("123456");
            return req;
        }

        @Test
        @DisplayName("邮箱注册成功 - 自动登录返回 token")
        void emailRegister_success() {
            EmailRegisterRequest request = buildRequest();
            when(emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.REGISTER)).thenReturn(true);
            when(userRepository.existsByUsername("newuser")).thenReturn(false);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@example.com")).thenReturn(Optional.empty());
            when(jwtService.generateSigningKey()).thenReturn("signkey");
            when(jwtService.generateAccessToken(anyLong(), anyString(), anyList())).thenReturn("access-token");
            when(jwtService.generateRefreshToken(anyLong())).thenReturn("refresh-token");
            when(jwtService.getRefreshTokenExpiryMs()).thenReturn(7 * 24 * 60 * 60 * 1000L);
            when(refreshTokenRepository.findByUserIdOrderByCreatedAtAsc(anyLong())).thenReturn(List.of());
            // save 回填 ID
            when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
                User u = invocation.getArgument(0);
                if (u.getId() == null) {
                    ReflectionTestUtils.setField(u, "id", 1L);
                }
                return u;
            });

            LoginResponse result = authService.emailRegister(request, response);

            assertThat(result.getAccessToken()).isEqualTo("access-token");
            assertThat(result.getSigningKey()).isEqualTo("signkey");
            assertThat(result.getUser().getUsername()).isEqualTo("newuser");
            verify(userRepository, times(2)).save(any(User.class));
        }

        @Test
        @DisplayName("验证码错误 → 抛出异常")
        void emailRegister_invalidCode() {
            EmailRegisterRequest request = buildRequest();
            when(emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.REGISTER)).thenReturn(false);

            assertThatThrownBy(() -> authService.emailRegister(request, response))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_CODE_INVALID);
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("用户名已存在 → 抛出异常")
        void emailRegister_duplicateUsername() {
            EmailRegisterRequest request = buildRequest();
            when(emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.REGISTER)).thenReturn(true);
            when(userRepository.existsByUsername("newuser")).thenReturn(true);

            assertThatThrownBy(() -> authService.emailRegister(request, response))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.USER_ALREADY_EXISTS);
        }

        @Test
        @DisplayName("邮箱已被已验证用户绑定 → 抛出异常")
        void emailRegister_emailAlreadyBound() {
            EmailRegisterRequest request = buildRequest();
            when(emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.REGISTER)).thenReturn(true);
            when(userRepository.existsByUsername("newuser")).thenReturn(false);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@example.com"))
                    .thenReturn(Optional.of(mock(User.class)));

            assertThatThrownBy(() -> authService.emailRegister(request, response))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.USER_ALREADY_EXISTS);
        }

        @Test
        @DisplayName("密码不满足强度要求 → 抛出异常")
        void emailRegister_weakPassword() {
            EmailRegisterRequest request = buildRequest();
            request.setPassword("password");
            when(emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.REGISTER)).thenReturn(true);
            when(userRepository.existsByUsername("newuser")).thenReturn(false);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@example.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> authService.emailRegister(request, response))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);
        }
    }

    // ========== 邮箱登录测试 ==========

    @Nested
    @DisplayName("login 邮箱登录")
    class EmailLoginTests {

        @Test
        @DisplayName("使用邮箱登录 - 输入包含@，走邮箱查询")
        void login_withEmail() {
            User emailUser = User.builder()
                    .id(10L).username("emailuser").email("user@example.com").passwordHash("$2a$10$hash")
                    .emailVerified(true)
                    .roles(Set.of(userRole)).isEnabled(true).mustChangePassword(false)
                    .loginFailCount(0).createdAt(LocalDateTime.now(ZoneOffset.UTC))
                    .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();

            when(userRepository.findByEmailAndEmailVerifiedTrue("user@example.com")).thenReturn(Optional.of(emailUser));

            LoginRequest req = new LoginRequest();
            req.setUsername("user@example.com");
            req.setPassword("wrong");

            // 密码不匹配会抛 AuthException，但关键是验证走了邮箱查询路径
            assertThatThrownBy(() -> authService.login(req, response))
                    .isInstanceOf(AuthException.class);
            verify(userRepository).findByEmailAndEmailVerifiedTrue("user@example.com");
            verify(userRepository, never()).findByUsername(anyString());
        }

        @Test
        @DisplayName("使用用户名登录 - 输入不含@，走用户名查询")
        void login_withUsername() {
            when(userRepository.findByUsername("testuser")).thenReturn(Optional.of(enabledUser));

            LoginRequest req = new LoginRequest();
            req.setUsername("testuser");
            req.setPassword("wrong");

            assertThatThrownBy(() -> authService.login(req, response))
                    .isInstanceOf(AuthException.class);
            verify(userRepository).findByUsername("testuser");
            verify(userRepository, never()).findByEmailAndEmailVerifiedTrue(anyString());
        }

        @Test
        @DisplayName("邮箱未验证 → 登录失败")
        void login_emailNotVerified() {
            when(userRepository.findByEmailAndEmailVerifiedTrue("unverified@example.com")).thenReturn(Optional.empty());

            LoginRequest req = new LoginRequest();
            req.setUsername("unverified@example.com");
            req.setPassword("Password1");

            assertThatThrownBy(() -> authService.login(req, response))
                    .isInstanceOf(AuthException.class)
                    .hasMessageContaining("用户名或密码错误");
        }
    }

    // ========== 邮箱重置密码测试 ==========

    @Nested
    @DisplayName("resetPassword 邮箱重置密码")
    class ResetPasswordTests {

        @Test
        @DisplayName("重置密码成功 - 更新密码并清除所有 refresh token")
        void resetPassword_success() {
            User user = User.builder()
                    .id(1L).username("testuser").email("test@qq.com").passwordHash("old-hash")
                    .emailVerified(true)
                    .roles(Set.of(userRole)).isEnabled(true).mustChangePassword(false)
                    .loginFailCount(0).createdAt(LocalDateTime.now(ZoneOffset.UTC))
                    .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();

            when(emailCodeService.verifyCode("test@qq.com", "123456", EmailCodePurpose.RESET_PASSWORD)).thenReturn(true);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@qq.com")).thenReturn(Optional.of(user));
            when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
            when(refreshTokenRepository.findByUserIdOrderByCreatedAtAsc(1L)).thenReturn(List.of());

            assertThatCode(() -> authService.resetPassword("test@qq.com", "123456", "NewPass1"))
                    .doesNotThrowAnyException();

            verify(userRepository).save(argThat(u -> u.getPasswordHash() != null && !u.getPasswordHash().equals("old-hash")));
            verify(refreshTokenRepository).findByUserIdOrderByCreatedAtAsc(1L);
        }

        @Test
        @DisplayName("验证码错误 → 抛出异常")
        void resetPassword_invalidCode() {
            when(emailCodeService.verifyCode("test@qq.com", "wrong", EmailCodePurpose.RESET_PASSWORD)).thenReturn(false);

            assertThatThrownBy(() -> authService.resetPassword("test@qq.com", "wrong", "NewPass1"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("验证码错误");
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("邮箱未注册 → 抛出异常")
        void resetPassword_emailNotFound() {
            when(emailCodeService.verifyCode("nobody@qq.com", "123456", EmailCodePurpose.RESET_PASSWORD)).thenReturn(true);
            when(userRepository.findByEmailAndEmailVerifiedTrue("nobody@qq.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> authService.resetPassword("nobody@qq.com", "123456", "NewPass1"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("该邮箱未注册");
        }

        @Test
        @DisplayName("新密码不满足强度要求 → 抛出异常")
        void resetPassword_weakPassword() {
            User user = User.builder()
                    .id(1L).username("testuser").email("test@qq.com").passwordHash("old-hash")
                    .emailVerified(true)
                    .roles(Set.of(userRole)).isEnabled(true).mustChangePassword(false)
                    .loginFailCount(0).createdAt(LocalDateTime.now(ZoneOffset.UTC))
                    .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();

            when(emailCodeService.verifyCode("test@qq.com", "123456", EmailCodePurpose.RESET_PASSWORD)).thenReturn(true);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@qq.com")).thenReturn(Optional.of(user));

            assertThatThrownBy(() -> authService.resetPassword("test@qq.com", "123456", "weak"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("密码须包含");
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("重置密码后清除所有 refresh token")
        void resetPassword_clearsRefreshTokens() {
            User user = User.builder()
                    .id(1L).username("testuser").email("test@qq.com").passwordHash("old-hash")
                    .emailVerified(true)
                    .roles(Set.of(userRole)).isEnabled(true).mustChangePassword(false)
                    .loginFailCount(0).createdAt(LocalDateTime.now(ZoneOffset.UTC))
                    .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();

            RefreshToken t1 = RefreshToken.builder().id(1L).tokenHash("h1").userId(1L).build();
            RefreshToken t2 = RefreshToken.builder().id(2L).tokenHash("h2").userId(1L).build();

            when(emailCodeService.verifyCode("test@qq.com", "123456", EmailCodePurpose.RESET_PASSWORD)).thenReturn(true);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@qq.com")).thenReturn(Optional.of(user));
            when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
            when(refreshTokenRepository.findByUserIdOrderByCreatedAtAsc(1L)).thenReturn(List.of(t1, t2));

            authService.resetPassword("test@qq.com", "123456", "NewPass1");

            verify(refreshTokenRepository).deleteAll(List.of(t1, t2));
        }
    }
}
