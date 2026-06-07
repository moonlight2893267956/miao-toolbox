package com.miao.toolbox.auth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.impl.DefaultClaims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.*;

@DisplayName("JwtService 单元测试")
class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        // access secret: 至少 32 字节
        String accessSecret = "test-access-secret-key-that-is-at-least-256-bits-long-for-testing";
        String refreshSecret = "test-refresh-secret-key-that-is-at-least-256-bits-long-for-testing";
        jwtService = new JwtService(accessSecret, refreshSecret, 15, 7);
    }

    @Nested
    @DisplayName("Access Token 生成与验证")
    class AccessTokenTests {

        @Test
        @DisplayName("生成并验证有效的 access token")
        void generateAndValidateAccessToken() {
            String token = jwtService.generateAccessToken(1L, "testuser", "USER");

            Claims claims = jwtService.validateAccessToken(token);
            assertThat(claims).isNotNull();
            assertThat(jwtService.extractUserId(claims)).isEqualTo(1L);
            assertThat(jwtService.extractUsername(claims)).isEqualTo("testuser");
            assertThat(jwtService.extractRole(claims)).isEqualTo("USER");
        }

        @Test
        @DisplayName("access token 包含 type=access 声明")
        void accessTokenContainsTypeClaim() {
            String token = jwtService.generateAccessToken(1L, "testuser", "USER");
            Claims claims = jwtService.validateAccessToken(token);
            assertThat(claims.get("type", String.class)).isEqualTo("access");
        }

        @Test
        @DisplayName("无效的 access token → 返回 null")
        void validateInvalidAccessToken() {
            assertThat(jwtService.validateAccessToken("invalid-token")).isNull();
        }

        @Test
        @DisplayName("空字符串 access token → 返回 null")
        void validateEmptyAccessToken() {
            assertThat(jwtService.validateAccessToken("")).isNull();
        }

        @Test
        @DisplayName("access token 不能用 refresh secret 验证")
        void accessTokenCannotBeValidatedWithRefreshKey() {
            String token = jwtService.generateAccessToken(1L, "testuser", "USER");
            // 用 refresh 验证应返回 null
            assertThat(jwtService.validateRefreshToken(token)).isNull();
        }
    }

    @Nested
    @DisplayName("Refresh Token 生成与验证")
    class RefreshTokenTests {

        @Test
        @DisplayName("生成并验证有效的 refresh token")
        void generateAndValidateRefreshToken() {
            String token = jwtService.generateRefreshToken(1L);

            Claims claims = jwtService.validateRefreshToken(token);
            assertThat(claims).isNotNull();
            assertThat(jwtService.extractUserId(claims)).isEqualTo(1L);
        }

        @Test
        @DisplayName("refresh token 包含 type=refresh 声明")
        void refreshTokenContainsTypeClaim() {
            String token = jwtService.generateRefreshToken(1L);
            Claims claims = jwtService.validateRefreshToken(token);
            assertThat(claims.get("type", String.class)).isEqualTo("refresh");
        }

        @Test
        @DisplayName("refresh token 不能用 access secret 验证")
        void refreshTokenCannotBeValidatedWithAccessKey() {
            String token = jwtService.generateRefreshToken(1L);
            assertThat(jwtService.validateAccessToken(token)).isNull();
        }

        @Test
        @DisplayName("无效的 refresh token → 返回 null")
        void validateInvalidRefreshToken() {
            assertThat(jwtService.validateRefreshToken("garbage")).isNull();
        }
    }

    @Nested
    @DisplayName("签名密钥生成")
    class SigningKeyTests {

        @Test
        @DisplayName("生成的 signing key 为 32 位 hex 字符串")
        void generateSigningKey() {
            String key = jwtService.generateSigningKey();
            assertThat(key).isNotBlank();
            assertThat(key).hasSize(32); // UUID 去掉横线后 32 字符
        }

        @Test
        @DisplayName("每次生成的 signing key 不同")
        void signingKeyIsUnique() {
            String key1 = jwtService.generateSigningKey();
            String key2 = jwtService.generateSigningKey();
            assertThat(key1).isNotEqualTo(key2);
        }
    }

    @Nested
    @DisplayName("密钥分离安全验证")
    class KeySeparationTests {

        @Test
        @DisplayName("access token 不能伪造为 refresh token（密钥不同）")
        void cannotForgeRefreshFromAccessToken() {
            String accessToken = jwtService.generateAccessToken(1L, "hacker", "ADMIN");
            // 即使持有 access token，也无法用它通过 refresh 验证
            assertThat(jwtService.validateRefreshToken(accessToken)).isNull();
        }

        @Test
        @DisplayName("refresh token 不能提取 username 和 role（无这些声明）")
        void refreshTokenHasNoUsernameOrRole() {
            String refreshToken = jwtService.generateRefreshToken(1L);
            Claims claims = jwtService.validateRefreshToken(refreshToken);
            assertThat(claims).isNotNull();
            assertThat(claims.get("username")).isNull();
            assertThat(claims.get("role")).isNull();
        }
    }

    @Test
    @DisplayName("密钥太短 → 构造时抛出异常")
    void secretTooShort() {
        assertThatThrownBy(() -> new JwtService("short", "short", 15, 7))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("256 bits");
    }

    @Test
    @DisplayName("getRefreshTokenExpiryMs 返回正确值")
    void getRefreshTokenExpiryMs() {
        assertThat(jwtService.getRefreshTokenExpiryMs()).isEqualTo(7 * 24 * 60 * 60 * 1000L);
    }
}
