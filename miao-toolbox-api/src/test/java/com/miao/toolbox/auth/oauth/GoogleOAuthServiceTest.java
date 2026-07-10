package com.miao.toolbox.auth.oauth;

import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.auth.service.AuthService;
import com.miao.toolbox.auth.service.JwtService;
import com.miao.toolbox.common.exception.AuthException;
import com.miao.toolbox.common.exception.BusinessException;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("GoogleOAuthService 单元测试")
class GoogleOAuthServiceTest {

    @Mock private GoogleOAuthProperties googleOAuthProperties;
    @Mock private UserRepository userRepository;
    @Mock private RoleRepository roleRepository;
    @Mock private JwtService jwtService;
    @Mock private AuthService authService;
    @Mock private RestTemplate restTemplate;
    @Mock private HttpServletResponse response;
    @InjectMocks private GoogleOAuthService googleOAuthService;

    @BeforeEach
    void setUp() {
        Role userRole = Role.builder().id(2L).code("USER").name("普通用户").isSystem(true).build();
        when(roleRepository.findByCode("USER")).thenReturn(Optional.of(userRole));
        when(googleOAuthProperties.getClientId()).thenReturn("test-google-client-id");
        when(googleOAuthProperties.getClientSecret()).thenReturn("test-google-client-secret");
        when(googleOAuthProperties.getRedirectUri()).thenReturn("http://localhost:8080/api/auth/oauth/google/callback");
        when(googleOAuthProperties.getFrontendCallbackUrl()).thenReturn("http://localhost:5173/oauth/callback");
        when(googleOAuthProperties.getScope()).thenReturn("openid email profile");
        when(jwtService.generateSigningKey()).thenReturn("mock-signing-key");
        when(jwtService.generateAccessToken(anyLong(), anyString(), anyList())).thenReturn("mock-access-token");
        when(jwtService.generateRefreshToken(anyLong())).thenReturn("mock-refresh-token");
    }

    @Nested
    @DisplayName("buildAuthorizationUrl 构建授权 URL")
    class BuildAuthorizationUrlTests {

        @Test
        @DisplayName("URL 包含必要参数")
        void urlContainsRequiredParams() {
            String url = googleOAuthService.buildAuthorizationUrl();

            assertThat(url).startsWith("https://accounts.google.com/o/oauth2/v2/auth");
            assertThat(url).contains("client_id=");
            assertThat(url).contains("redirect_uri=");
            assertThat(url).contains("scope=");
            assertThat(url).contains("response_type=code");
            assertThat(url).contains("state=");
        }

        @Test
        @DisplayName("每次生成不同的 state")
        void differentStateEachTime() {
            // generateSigningKey 默认返回固定 mock 值，需要让每次返回不同值
            when(jwtService.generateSigningKey()).thenReturn("state-key-1", "state-key-2");

            String url1 = googleOAuthService.buildAuthorizationUrl();
            String url2 = googleOAuthService.buildAuthorizationUrl();

            // 提取 state 参数
            String state1 = url1.replaceAll(".*state=([^&]+).*", "$1");
            String state2 = url2.replaceAll(".*state=([^&]+).*", "$1");

            assertThat(state1).isNotEqualTo(state2);
        }
    }

    @Nested
    @DisplayName("handleCallback 回调处理")
    class HandleCallbackTests {

        @Test
        @DisplayName("state 为空 → 抛出登录失败异常")
        void stateBlankThrowsException() {
            assertThatThrownBy(() -> googleOAuthService.handleCallback("code", "", response))
                    .isInstanceOf(AuthException.class);
            assertThatThrownBy(() -> googleOAuthService.handleCallback("code", null, response))
                    .isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("state 无效（未存储）→ 抛出登录失败异常")
        void invalidStateThrowsException() {
            assertThatThrownBy(() -> googleOAuthService.handleCallback("code", "invalid-state", response))
                    .isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("state 过期 → 抛出登录失败异常")
        void expiredStateThrowsException() throws Exception {
            // 用反射向 stateStore 中放入一个已过期的 state
            String expiredState = "expired-state";
            java.lang.reflect.Field stateStoreField = GoogleOAuthService.class.getDeclaredField("stateStore");
            stateStoreField.setAccessible(true);
            @SuppressWarnings("unchecked")
            java.util.concurrent.ConcurrentHashMap<String, String> stateStore =
                    (java.util.concurrent.ConcurrentHashMap<String, String>) stateStoreField.get(googleOAuthService);
            stateStore.put(expiredState,
                    (System.currentTimeMillis() - 11 * 60 * 1000L) + ",login,0");

            assertThatThrownBy(() -> googleOAuthService.handleCallback("code", expiredState, response))
                    .isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("state 已使用过（重放）→ 抛出登录失败异常")
        void replayedStateThrowsException() {
            // 先构造一个有效的回调，使用掉 state
            String state = googleOAuthService.buildAuthorizationUrl()
                    .replaceAll(".*state=([^&]+).*", "$1");

            // 模拟 token 交换和用户信息获取
            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));
            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("1234567890");
            googleUser.setName("Test User");
            googleUser.setEmail("test@gmail.com");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));
            when(userRepository.findByGoogleId("1234567890")).thenReturn(Optional.of(buildTestUser()));

            // 第一次调用成功
            googleOAuthService.handleCallback("code", state, response);

            // 第二次重放同一 state 应失败
            assertThatThrownBy(() -> googleOAuthService.handleCallback("code", state, response))
                    .isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("首次 Google 登录 → 自动创建用户")
        void firstLoginCreatesUser() {
            String state = googleOAuthService.buildAuthorizationUrl()
                    .replaceAll(".*state=([^&]+).*", "$1");

            // 模拟 token 交换
            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));

            // 模拟用户信息获取
            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("999999");
            googleUser.setName("NewUser");
            googleUser.setEmail("new@gmail.com");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));

            // 首次登录：数据库中无此用户
            when(userRepository.findByGoogleId("999999")).thenReturn(Optional.empty());
            when(userRepository.existsByUsername(anyString())).thenReturn(false);
            when(userRepository.save(any(User.class))).thenAnswer(inv -> {
                User u = inv.getArgument(0);
                u.setId(100L);
                return u;
            });

            LoginResponse result = googleOAuthService.handleCallback("code", state, response);

            assertThat(result.getAccessToken()).isEqualTo("mock-access-token");
            assertThat(result.getMustChangePassword()).isTrue();
            verify(userRepository, atLeastOnce()).save(argThat(user ->
                    "999999".equals(user.getGoogleId()) && "NewUser".equals(user.getGoogleUsername())
                            && Boolean.TRUE.equals(user.getMustChangePassword())
            ));
        }

        @Test
        @DisplayName("已有用户 → 直接返回 token")
        void existingUserReturnsToken() {
            String state = googleOAuthService.buildAuthorizationUrl()
                    .replaceAll(".*state=([^&]+).*", "$1");

            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));

            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("1234567890");
            googleUser.setName("Test User");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));

            User existingUser = buildTestUser();
            when(userRepository.findByGoogleId("1234567890")).thenReturn(Optional.of(existingUser));

            LoginResponse result = googleOAuthService.handleCallback("code", state, response);

            assertThat(result.getAccessToken()).isEqualTo("mock-access-token");
        }

        @Test
        @DisplayName("绑定模式 → 关联 googleId")
        void bindModeAssociatesGoogleId() {
            String state = googleOAuthService.buildBindAuthorizationUrl(1L)
                    .replaceAll(".*state=([^&]+).*", "$1");

            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));

            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("999999");
            googleUser.setName("BoundUser");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));

            User user = buildTestUser();
            when(userRepository.findById(1L)).thenReturn(Optional.of(user));
            when(userRepository.findByGoogleId("999999")).thenReturn(Optional.empty());

            LoginResponse result = googleOAuthService.handleCallback("code", state, response);

            assertThat(result.getAccessToken()).isEqualTo("mock-access-token");
            verify(userRepository, atLeastOnce()).save(argThat(u ->
                    "999999".equals(u.getGoogleId()) && "BoundUser".equals(u.getGoogleUsername())
            ));
        }

        @Test
        @DisplayName("已绑定 → 拒绝重复绑定")
        void alreadyBoundRejectsRebind() {
            String state = googleOAuthService.buildBindAuthorizationUrl(1L)
                    .replaceAll(".*state=([^&]+).*", "$1");

            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));

            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("1234567890");
            googleUser.setName("Test User");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));

            User user = buildTestUser();
            user.setGoogleId("already-bound-id");
            when(userRepository.findById(1L)).thenReturn(Optional.of(user));

            assertThatThrownBy(() -> googleOAuthService.handleCallback("code", state, response))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("已绑定");
        }

        @Test
        @DisplayName("账号被禁用 → 拒绝登录")
        void disabledUserRejected() {
            String state = googleOAuthService.buildAuthorizationUrl()
                    .replaceAll(".*state=([^&]+).*", "$1");

            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));

            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("1234567890");
            googleUser.setName("Test User");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));

            User disabledUser = buildTestUser();
            disabledUser.setIsEnabled(false);
            when(userRepository.findByGoogleId("1234567890")).thenReturn(Optional.of(disabledUser));

            assertThatThrownBy(() -> googleOAuthService.handleCallback("code", state, response))
                    .isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("账号被锁定 → 拒绝登录")
        void lockedUserRejected() {
            String state = googleOAuthService.buildAuthorizationUrl()
                    .replaceAll(".*state=([^&]+).*", "$1");

            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));

            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("1234567890");
            googleUser.setName("Test User");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));

            User lockedUser = buildTestUser();
            lockedUser.setLockedUntil(LocalDateTime.now(ZoneOffset.UTC).plusHours(1));
            when(userRepository.findByGoogleId("1234567890")).thenReturn(Optional.of(lockedUser));

            assertThatThrownBy(() -> googleOAuthService.handleCallback("code", state, response))
                    .isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("并发创建 DataIntegrityViolation → 重试查找成功")
        void concurrentCreationRetriesFind() {
            String state = googleOAuthService.buildAuthorizationUrl()
                    .replaceAll(".*state=([^&]+).*", "$1");

            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));

            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("999999");
            googleUser.setName("ConcurrentUser");
            googleUser.setEmail("concurrent@gmail.com");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));

            // 第一次 findByGoogleId 返回 empty，触发 createOAuthUser
            // createOAuthUser 内部：save 抛 DataIntegrityViolation → catch → 第二次 findByGoogleId 返回有效 user
            User concurrentUser = buildTestUser();
            concurrentUser.setGoogleId("999999");
            concurrentUser.setGoogleUsername("ConcurrentUser");
            when(userRepository.findByGoogleId("999999"))
                    .thenReturn(Optional.empty())   // 第一次：触发 createOAuthUser
                    .thenReturn(Optional.of(concurrentUser));  // 第二次（createOAuthUser 内部 catch 后重试）
            when(userRepository.existsByUsername(anyString())).thenReturn(false);
            // 第一次 save 抛 DataIntegrityViolation，之后 save 正常
            when(userRepository.save(any(User.class)))
                    .thenThrow(new DataIntegrityViolationException("duplicate"))
                    .thenAnswer(inv -> inv.getArgument(0));

            LoginResponse result = googleOAuthService.handleCallback("code", state, response);

            assertThat(result.getAccessToken()).isEqualTo("mock-access-token");
        }
    }

    @Nested
    @DisplayName("exchangeCodeForToken Token 交换")
    class ExchangeCodeForTokenTests {

        @Test
        @DisplayName("Token 交换失败 → 抛出登录失败异常")
        void tokenExchangeFails() {
            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("error", "invalid_grant")));

            assertThatThrownBy(() -> {
                String state = googleOAuthService.buildAuthorizationUrl()
                        .replaceAll(".*state=([^&]+).*", "$1");
                // 需要 mock fetchGoogleUser 使之不会先被调用
                // 实际上 exchangeCodeForToken 在 handleCallback 内部调用
                // 但它先于 fetchGoogleUser，所以 token 失败就会抛异常
                when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                        .thenThrow(new RuntimeException("should not reach here"));
                googleOAuthService.handleCallback("code", state, response);
            }).isInstanceOf(AuthException.class);
        }

        @Test
        @DisplayName("Token 交换 HTTP 错误 → 抛出登录失败异常")
        void tokenExchangeHttpError() {
            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenThrow(new HttpClientErrorException(HttpStatus.BAD_REQUEST));

            assertThatThrownBy(() -> {
                String state = googleOAuthService.buildAuthorizationUrl()
                        .replaceAll(".*state=([^&]+).*", "$1");
                googleOAuthService.handleCallback("code", state, response);
            }).isInstanceOf(AuthException.class);
        }
    }

    @Nested
    @DisplayName("fetchGoogleUser 用户信息获取")
    class FetchGoogleUserTests {

        @Test
        @DisplayName("API 错误 → 抛出登录失败异常")
        void apiErrorThrowsException() {
            String state = googleOAuthService.buildAuthorizationUrl()
                    .replaceAll(".*state=([^&]+).*", "$1");

            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenThrow(new HttpClientErrorException(HttpStatus.UNAUTHORIZED));

            assertThatThrownBy(() -> googleOAuthService.handleCallback("code", state, response))
                    .isInstanceOf(AuthException.class);
        }
    }

    @Nested
    @DisplayName("generateUniqueUsername 用户名生成")
    class GenerateUniqueUsernameTests {

        @Test
        @DisplayName("纯中文名 → 使用 google_ + sub 后6位")
        void chineseNameUsesSubSuffix() {
            String state = googleOAuthService.buildAuthorizationUrl()
                    .replaceAll(".*state=([^&]+).*", "$1");

            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));

            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("123456789012345678901");
            googleUser.setName("张三");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));

            when(userRepository.findByGoogleId("123456789012345678901")).thenReturn(Optional.empty());
            when(userRepository.existsByUsername("google_678901")).thenReturn(false);
            when(userRepository.save(any(User.class))).thenAnswer(inv -> {
                User u = inv.getArgument(0);
                u.setId(200L);
                return u;
            });

            LoginResponse result = googleOAuthService.handleCallback("code", state, response);

            verify(userRepository, atLeastOnce()).save(argThat(user ->
                    "google_678901".equals(user.getUsername())
            ));
        }

        @Test
        @DisplayName("用户名冲突时自动追加序号")
        void usernameConflictAppendsNumber() {
            String state = googleOAuthService.buildAuthorizationUrl()
                    .replaceAll(".*state=([^&]+).*", "$1");

            when(restTemplate.postForEntity(eq("https://oauth2.googleapis.com/token"), any(), eq(Map.class)))
                    .thenReturn(ResponseEntity.ok(Map.of("access_token", "google-access-token")));

            GoogleUser googleUser = new GoogleUser();
            googleUser.setSub("999");
            googleUser.setName("TestUser");
            when(restTemplate.exchange(eq("https://openidconnect.googleapis.com/v1/userinfo"), any(HttpMethod.class), any(), eq(GoogleUser.class)))
                    .thenReturn(ResponseEntity.ok(googleUser));

            when(userRepository.findByGoogleId("999")).thenReturn(Optional.empty());
            when(userRepository.existsByUsername("TestUser")).thenReturn(true);
            when(userRepository.existsByUsername("TestUser_1")).thenReturn(true);
            when(userRepository.existsByUsername("TestUser_2")).thenReturn(false);
            when(userRepository.save(any(User.class))).thenAnswer(inv -> {
                User u = inv.getArgument(0);
                u.setId(200L);
                return u;
            });

            LoginResponse result = googleOAuthService.handleCallback("code", state, response);

            verify(userRepository, atLeastOnce()).save(argThat(user ->
                    "TestUser_2".equals(user.getUsername())
            ));
        }
    }

    private User buildTestUser() {
        return User.builder()
                .id(1L)
                .username("testuser")
                .roles(java.util.Set.of())
                .isEnabled(true)
                .mustChangePassword(false)
                .loginFailCount(0)
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();
    }
}
