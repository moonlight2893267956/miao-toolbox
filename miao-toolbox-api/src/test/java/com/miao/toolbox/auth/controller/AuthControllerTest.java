package com.miao.toolbox.auth.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.dto.LoginRequest;
import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.dto.RegisterRequest;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.service.AuthService;
import com.miao.toolbox.auth.service.RouteAccessService;
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.Collections;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthController 单元测试")
class AuthControllerTest {

    @Mock private AuthService authService;
    @Mock private RouteAccessService routeAccessService;
    @InjectMocks private AuthController authController;

    private RegisterRequest registerRequest;
    private LoginRequest loginRequest;
    private LoginResponse loginResponse;

    @BeforeEach
    void setUp() {
        registerRequest = new RegisterRequest();
        registerRequest.setUsername("testuser");
        registerRequest.setPassword("Password1");

        loginRequest = new LoginRequest();
        loginRequest.setUsername("testuser");
        loginRequest.setPassword("Password1");

        loginResponse = LoginResponse.builder()
                .accessToken("access-token")
                .signingKey("signing-key")
                .mustChangePassword(false)
                .user(LoginResponse.UserInfo.builder().id(1L).username("testuser").roles(Collections.emptyList()).build())
                .build();
    }

    @Nested
    @DisplayName("POST /api/auth/register")
    class RegisterTests {

        @Test
        @DisplayName("正常注册 → 201 + SUCCESS")
        void register_success() {
            doNothing().when(authService).register(any(RegisterRequest.class));

            ResponseEntity<?> response = authController.register(registerRequest);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            verify(authService).register(any(RegisterRequest.class));
        }

        @Test
        @DisplayName("用户名重复 → 抛出 BusinessException(409)")
        void register_duplicate() {
            doThrow(new BusinessException("USER_ALREADY_EXISTS", "用户名已存在", 409))
                    .when(authService).register(any());

            assertThatThrownBy(() -> authController.register(registerRequest))
                    .isInstanceOf(BusinessException.class)
                    .extracting("httpStatus").isEqualTo(409);
        }
    }

    @Nested
    @DisplayName("POST /api/auth/login")
    class LoginTests {

        @Test
        @DisplayName("正常登录 → 200 + token")
        void login_success() {
            when(authService.login(any(LoginRequest.class), any())).thenReturn(loginResponse);

            ResponseEntity<?> response = authController.login(loginRequest, null);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(authService).login(any(LoginRequest.class), any());
        }

        @Test
        @DisplayName("登录失败 → 抛出 AuthException")
        void login_failed() {
            when(authService.login(any(LoginRequest.class), any()))
                    .thenThrow(AuthException.loginFailed());

            assertThatThrownBy(() -> authController.login(loginRequest, null))
                    .isInstanceOf(AuthException.class);
        }
    }

    @Nested
    @DisplayName("POST /api/auth/refresh")
    class RefreshTests {

        @Test
        @DisplayName("正常刷新 → 200 + 新 token")
        void refresh_success() {
            when(authService.refresh(any(), any())).thenReturn(loginResponse);

            ResponseEntity<?> response = authController.refresh("refresh-token", null);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }
    }

    @Nested
    @DisplayName("POST /api/auth/logout")
    class LogoutTests {

        @Test
        @DisplayName("正常注销 → 200")
        void logout_success() {
            doNothing().when(authService).logout(any(), any());

            ResponseEntity<?> response = authController.logout("refresh-token", null);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(authService).logout(any(), any());
        }
    }

    @Nested
    @DisplayName("GET /api/auth/me/routes")
    class RoutesTests {

        @Test
        @DisplayName("正常查询 → 返回当前用户可访问路由码")
        void routes_success() {
            User user = User.builder().id(1L).username("testuser").build();
            var auth = new UsernamePasswordAuthenticationToken(user, null, Collections.emptyList());
            when(routeAccessService.getAccessibleRouteCodes(1L, auth))
                    .thenReturn(List.of("TOOL_TEXT_COMPARE", "PAGE_SETTINGS"));

            ResponseEntity<?> response = authController.getAccessibleRoutes(user, auth);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(routeAccessService).getAccessibleRouteCodes(1L, auth);
        }
    }
}
