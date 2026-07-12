package com.miao.toolbox.auth.controller;

import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.dto.RoleBrief;
import com.miao.toolbox.auth.oauth.GitHubOAuthService;
import com.miao.toolbox.auth.oauth.GoogleOAuthProperties;
import com.miao.toolbox.auth.oauth.GoogleOAuthService;
import com.miao.toolbox.auth.oauth.OAuthProperties;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("OAuthController 单元测试")
class OAuthControllerTest {

    private static final String FRONTEND_CALLBACK = "http://localhost:5173/oauth/callback";

    @Mock private GitHubOAuthService gitHubOAuthService;
    @Mock private GoogleOAuthService googleOAuthService;
    @Mock private OAuthProperties oAuthProperties;
    @Mock private GoogleOAuthProperties googleOAuthProperties;
    @Mock private HttpServletResponse response;

    private OAuthController controller;

    @BeforeEach
    void setUp() {
        controller = new OAuthController(gitHubOAuthService, googleOAuthService,
                oAuthProperties, googleOAuthProperties);
        when(oAuthProperties.getFrontendCallbackUrl()).thenReturn(FRONTEND_CALLBACK);
        when(googleOAuthProperties.getFrontendCallbackUrl()).thenReturn(FRONTEND_CALLBACK);
    }

    private String captureRedirect() throws IOException {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(response).sendRedirect(captor.capture());
        return captor.getValue();
    }

    @Nested
    @DisplayName("GitHub 回调错误处理")
    class GithubCallbackErrors {

        @Test
        @DisplayName("业务异常（绑定冲突）应回传可读 reason")
        void businessExceptionCarriesReason() throws IOException {
            String message = "该 GitHub 账号已被其他用户绑定";
            when(gitHubOAuthService.handleCallback(anyString(), anyString(), any()))
                    .thenThrow(new BusinessException(ErrorCode.VALIDATION_FAILED, message, 400));

            controller.githubCallback("code", "state", null, response);

            String redirect = captureRedirect();
            assertThat(redirect).startsWith(FRONTEND_CALLBACK + "#error=oauth_failed");
            assertThat(redirect).contains("&reason="
                    + URLEncoder.encode(message, StandardCharsets.UTF_8));
        }

        @Test
        @DisplayName("认证异常应仅回传通用错误码，不泄露内部信息")
        void authExceptionOnlyGenericError() throws IOException {
            when(gitHubOAuthService.handleCallback(anyString(), anyString(), any()))
                    .thenThrow(AuthException.loginFailed());

            controller.githubCallback("code", "state", null, response);

            String redirect = captureRedirect();
            assertThat(redirect).isEqualTo(FRONTEND_CALLBACK + "#error=oauth_failed");
            assertThat(redirect).doesNotContain("reason");
        }

        @Test
        @DisplayName("未知异常应仅回传通用错误码")
        void unknownExceptionOnlyGenericError() throws IOException {
            when(gitHubOAuthService.handleCallback(anyString(), anyString(), any()))
                    .thenThrow(new RuntimeException("connection reset"));

            controller.githubCallback("code", "state", null, response);

            String redirect = captureRedirect();
            assertThat(redirect).isEqualTo(FRONTEND_CALLBACK + "#error=oauth_failed");
            assertThat(redirect).doesNotContain("reason");
        }

        @Test
        @DisplayName("GitHub 返回 error 或缺少 code 时回传通用错误码")
        void providerErrorRedirectsGeneric() throws IOException {
            controller.githubCallback(null, "state", "access_denied", response);

            String redirect = captureRedirect();
            assertThat(redirect).isEqualTo(FRONTEND_CALLBACK + "#error=oauth_failed");
        }
    }

    @Nested
    @DisplayName("Google 回调错误处理")
    class GoogleCallbackErrors {

        @Test
        @DisplayName("业务异常应回传可读 reason")
        void businessExceptionCarriesReason() throws IOException {
            String message = "该 Google 账号已被其他用户绑定";
            when(googleOAuthService.handleCallback(anyString(), anyString(), any()))
                    .thenThrow(new BusinessException(ErrorCode.VALIDATION_FAILED, message, 400));

            controller.googleCallback("code", "state", null, response);

            String redirect = captureRedirect();
            assertThat(redirect).startsWith(FRONTEND_CALLBACK + "#error=oauth_failed");
            assertThat(redirect).contains("&reason="
                    + URLEncoder.encode(message, StandardCharsets.UTF_8));
        }

        @Test
        @DisplayName("认证异常应仅回传通用错误码")
        void authExceptionOnlyGenericError() throws IOException {
            when(googleOAuthService.handleCallback(anyString(), anyString(), any()))
                    .thenThrow(AuthException.loginFailed());

            controller.googleCallback("code", "state", null, response);

            String redirect = captureRedirect();
            assertThat(redirect).isEqualTo(FRONTEND_CALLBACK + "#error=oauth_failed");
        }
    }

    @Nested
    @DisplayName("回调成功")
    class CallbackSuccess {

        @Test
        @DisplayName("GitHub 成功应重定向携带 token fragment")
        void githubSuccessRedirectsWithToken() throws IOException {
            LoginResponse loginResponse = LoginResponse.builder()
                    .accessToken("jwt-token")
                    .signingKey("sign-key")
                    .mustChangePassword(false)
                    .user(LoginResponse.UserInfo.builder()
                            .id(1L)
                            .username("alice")
                            .roles(List.of(RoleBrief.builder().code("USER").name("普通用户").build()))
                            .build())
                    .build();
            when(gitHubOAuthService.handleCallback(anyString(), anyString(), any()))
                    .thenReturn(loginResponse);

            controller.githubCallback("code", "state", null, response);

            String redirect = captureRedirect();
            assertThat(redirect).startsWith(FRONTEND_CALLBACK + "#token=");
            assertThat(redirect).contains("username=alice");
            assertThat(redirect).doesNotContain("error");
        }
    }
}
