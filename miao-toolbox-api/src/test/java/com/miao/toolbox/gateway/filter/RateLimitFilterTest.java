package com.miao.toolbox.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("RateLimitFilter 单元测试")
class RateLimitFilterTest {

    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private RedisTemplate<String, Object> redisTemplate;
    @Mock private ValueOperations<String, Object> valueOperations;
    private ObjectMapper objectMapper = new ObjectMapper();
    private RateLimitFilter filter;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        filter = new RateLimitFilter(stringRedisTemplate, redisTemplate, objectMapper);
    }

    @Nested
    @DisplayName("限流逻辑")
    class RateLimitTests {

        @Test
        @DisplayName("未超限 → 正常通过")
        void withinLimit() throws Exception {
            when(stringRedisTemplate.execute(any(DefaultRedisScript.class), anyList(), anyString(), anyString(), anyString(), anyString()))
                    .thenReturn(1L);

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, (req, res) -> {});

            assertThat(response.getStatus()).isEqualTo(200);
        }

        @Test
        @DisplayName("超限 → 429 + Retry-After 头")
        void exceededLimit() throws Exception {
            when(stringRedisTemplate.execute(any(DefaultRedisScript.class), anyList(), anyString(), anyString(), anyString(), anyString()))
                    .thenReturn(0L);

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, (req, res) -> {});

            assertThat(response.getStatus()).isEqualTo(429);
            assertThat(response.getHeader("Retry-After")).isNotNull();
            assertThat(response.getContentAsString()).contains("RATE_LIMIT_EXCEEDED");
        }
    }

    @Nested
    @DisplayName("用户维度 vs IP 维度")
    class DimensionTests {

        @Test
        @DisplayName("认证用户 → 使用用户 ID 作为限流 key")
        void authenticatedUser_userDimension() throws Exception {
            User user = User.builder().id(42L).username("test").role(User.Role.USER)
                    .isEnabled(true).loginFailCount(0).build();
            var auth = new UsernamePasswordAuthenticationToken(
                    user, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
            SecurityContextHolder.getContext().setAuthentication(auth);

            when(stringRedisTemplate.execute(any(DefaultRedisScript.class), anyList(), anyString(), anyString(), anyString(), anyString()))
                    .thenReturn(1L);

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, (req, res) -> {});

            // 验证 redisTemplate.execute 被调用（key 包含用户 ID）
            verify(stringRedisTemplate).execute(any(DefaultRedisScript.class), anyList(), anyString(), anyString(), anyString(), anyString());

            SecurityContextHolder.clearContext();
        }

        @Test
        @DisplayName("未认证用户 → 使用 IP 作为限流 key")
        void unauthenticatedUser_ipDimension() throws Exception {
            when(stringRedisTemplate.execute(any(DefaultRedisScript.class), anyList(), anyString(), anyString(), anyString(), anyString()))
                    .thenReturn(1L);

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, (req, res) -> {});

            verify(stringRedisTemplate).execute(any(DefaultRedisScript.class), anyList(), anyString(), anyString(), anyString(), anyString());
        }
    }

    @Nested
    @DisplayName("shouldNotFilter 路径排除")
    class ShouldNotFilterTests {

        @Test
        @DisplayName("/actuator 路径不过滤")
        void actuatorNotFiltered() {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/actuator/health");
            assertThat(filter.shouldNotFilter(request)).isTrue();
        }

        @Test
        @DisplayName("/api/tools 路径需要过滤")
        void toolsPathsFiltered() {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tools");
            assertThat(filter.shouldNotFilter(request)).isFalse();
        }
    }
}
