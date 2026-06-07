package com.miao.toolbox.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Duration;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AntiReplayFilter 单元测试")
class AntiReplayFilterTest {

    @Mock private RedisTemplate<String, Object> redisTemplate;
    @Mock private ValueOperations<String, Object> valueOps;
    @Mock private UserRepository userRepository;
    private ObjectMapper objectMapper = new ObjectMapper();
    private AntiReplayFilter filter;

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOps);
        filter = new AntiReplayFilter(redisTemplate, objectMapper, userRepository);
    }

    @Nested
    @DisplayName("请求头校验")
    class HeaderValidationTests {

        @Test
        @DisplayName("缺少所有防重放头 → 400")
        void missingAllHeaders() throws Exception {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tools/1/execute");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, null);

            assertThat(response.getStatus()).isEqualTo(400);
            assertThat(response.getContentAsString()).contains("REPLAY_PROTECTION_FAILED");
        }

        @Test
        @DisplayName("缺少签名头 → 400")
        void missingSignatureHeader() throws Exception {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tools/1/execute");
            request.addHeader("X-Request-Timestamp", String.valueOf(System.currentTimeMillis()));
            request.addHeader("X-Request-Nonce", "nonce-123");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, null);

            assertThat(response.getStatus()).isEqualTo(400);
            assertThat(response.getContentAsString()).contains("REPLAY_PROTECTION_FAILED");
        }
    }

    @Nested
    @DisplayName("时间戳校验")
    class TimestampValidationTests {

        @Test
        @DisplayName("时间戳过期 → 400")
        void expiredTimestamp() throws Exception {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tools/1/execute");
            long expiredTimestamp = System.currentTimeMillis() - 6 * 60 * 1000; // 6分钟前
            request.addHeader("X-Request-Timestamp", String.valueOf(expiredTimestamp));
            request.addHeader("X-Request-Nonce", "nonce-123");
            request.addHeader("X-Request-Signature", "sig");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, null);

            assertThat(response.getStatus()).isEqualTo(400);
            assertThat(response.getContentAsString()).contains("REPLAY_TIMESTAMP_EXPIRED");
        }

        @Test
        @DisplayName("时间戳格式错误 → 400")
        void invalidTimestamp() throws Exception {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tools/1/execute");
            request.addHeader("X-Request-Timestamp", "not-a-number");
            request.addHeader("X-Request-Nonce", "nonce-123");
            request.addHeader("X-Request-Signature", "sig");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, null);

            assertThat(response.getStatus()).isEqualTo(400);
            assertThat(response.getContentAsString()).contains("REPLAY_TIMESTAMP_INVALID");
        }
    }

    @Nested
    @DisplayName("Nonce 校验")
    class NonceValidationTests {

        @Test
        @DisplayName("nonce 已使用过 → 400")
        void nonceAlreadyUsed() throws Exception {
            when(valueOps.setIfAbsent(anyString(), anyString(), any(Duration.class)))
                    .thenReturn(false);

            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tools/1/execute");
            request.addHeader("X-Request-Timestamp", String.valueOf(System.currentTimeMillis()));
            request.addHeader("X-Request-Nonce", "used-nonce");
            request.addHeader("X-Request-Signature", "sig");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilterInternal(request, response, null);

            assertThat(response.getStatus()).isEqualTo(400);
            assertThat(response.getContentAsString()).contains("REPLAY_NONCE_USED");
        }
    }

    @Nested
    @DisplayName("shouldNotFilter 路径排除")
    class ShouldNotFilterTests {

        @Test
        @DisplayName("/api/auth/login 路径不过滤")
        void authLoginPathNotFiltered() {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
            assertThat(filter.shouldNotFilter(request)).isTrue();
        }

        @Test
        @DisplayName("/api/auth/logout 路径需要过滤（需要 HMAC 签名保护）")
        void authLogoutPathFiltered() {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/logout");
            assertThat(filter.shouldNotFilter(request)).isFalse();
        }

        @Test
        @DisplayName("/api/tools 路径需要过滤")
        void toolsPathsFiltered() {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/tools/1/execute");
            assertThat(filter.shouldNotFilter(request)).isFalse();
        }
    }
}
