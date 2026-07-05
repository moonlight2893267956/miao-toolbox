package com.miao.toolbox.auth.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.auth.service.JwtService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("JwtAuthFilter 单元测试")
class JwtAuthFilterTest {

    @Mock private JwtService jwtService;
    @Mock private UserRepository userRepository;
    private ObjectMapper objectMapper = new ObjectMapper();

    private JwtAuthFilter filter;

    private User enabledUser;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthFilter(jwtService, userRepository, objectMapper);

        enabledUser = User.builder()
                .id(1L).username("testuser").passwordHash("hash")
                .isEnabled(true).mustChangePassword(false)
                .loginFailCount(0).signingKey("signkey")
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
    }

    @Nested
    @DisplayName("无/无效 token")
    class NoTokenTests {

        @Test
        @DisplayName("无 Authorization 头 → 继续过滤器链（不设置认证）")
        void noAuthHeader() throws Exception {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, (req, res) -> {});

            assertThat(response.getStatus()).isEqualTo(200);
            // SecurityContext 中无认证信息
        }

        @Test
        @DisplayName("无效 token → 401 + AUTH_TOKEN_EXPIRED")
        void invalidToken() throws Exception {
            when(jwtService.validateAccessToken("bad-token")).thenReturn(null);

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            request.addHeader("Authorization", "Bearer bad-token");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, (req, res) -> {});

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(response.getContentAsString()).contains("AUTH_TOKEN_EXPIRED");
        }
    }

    @Nested
    @DisplayName("用户状态校验")
    class UserStatusTests {

        private Claims claims;

        @BeforeEach
        void setUpClaims() {
            claims = mock(Claims.class);
            when(jwtService.validateAccessToken("valid-token")).thenReturn(claims);
            when(jwtService.extractUserId(claims)).thenReturn(1L);
            when(jwtService.extractUsername(claims)).thenReturn("testuser");
            when(jwtService.extractRoles(claims)).thenReturn(List.of("USER"));
        }

        @Test
        @DisplayName("用户不存在 → 401 + AUTH_TOKEN_INVALID")
        void userNotFound() throws Exception {
            when(userRepository.findById(1L)).thenReturn(Optional.empty());

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            request.addHeader("Authorization", "Bearer valid-token");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, (req, res) -> {});

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(response.getContentAsString()).contains("AUTH_TOKEN_INVALID");
        }

        @Test
        @DisplayName("禁用用户 → 401 + AUTH_LOGIN_FAILED（统一错误码防止用户枚举）")
        void disabledUser() throws Exception {
            User disabled = User.builder()
                    .id(1L).username("test")
                    .isEnabled(false).mustChangePassword(false).loginFailCount(0)
                    .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                    .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
            when(userRepository.findById(1L)).thenReturn(Optional.of(disabled));

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            request.addHeader("Authorization", "Bearer valid-token");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, null);

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(response.getContentAsString()).contains("AUTH_LOGIN_FAILED");
        }

        @Test
        @DisplayName("锁定用户 → 401 + AUTH_LOGIN_FAILED（统一错误码防止用户枚举）")
        void lockedUser() throws Exception {
            User locked = User.builder()
                    .id(1L).username("test")
                    .isEnabled(true).mustChangePassword(false).loginFailCount(5)
                    .lockedUntil(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(15))
                    .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                    .updatedAt(LocalDateTime.now(ZoneOffset.UTC)).build();
            when(userRepository.findById(1L)).thenReturn(Optional.of(locked));

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            request.addHeader("Authorization", "Bearer valid-token");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, null);

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(response.getContentAsString()).contains("AUTH_LOGIN_FAILED");
        }

        @Test
        @DisplayName("正常用户 → 通过过滤器链")
        void enabledUser() throws Exception {
            when(userRepository.findById(1L)).thenReturn(Optional.of(enabledUser));

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            request.addHeader("Authorization", "Bearer valid-token");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, (req, res) -> {});

            assertThat(response.getStatus()).isEqualTo(200);
        }
    }
}
