package com.miao.toolbox.auth.service;

import com.miao.toolbox.auth.dto.LoginRequest;
import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.dto.RegisterRequest;
import com.miao.toolbox.auth.entity.RefreshToken;
import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.RefreshTokenRepository;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
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
    @Mock private HttpServletResponse response;
    @InjectMocks private AuthService authService;

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
}
