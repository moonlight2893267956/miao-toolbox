package com.miao.toolbox.auth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Service
public class JwtService {

    private final SecretKey accessSecretKey;
    private final SecretKey refreshSecretKey;
    private final long accessTokenExpiryMs;
    private final long refreshTokenExpiryMs;

    public JwtService(
            @Value("${miao.jwt.secret}") String secret,
            @Value("${miao.jwt.refresh-secret:${miao.jwt.secret}-refresh}") String refreshSecret,
            @Value("${miao.jwt.access-token-expiry-minutes}") int accessExpiryMinutes,
            @Value("${miao.jwt.refresh-token-expiry-days}") int refreshExpiryDays) {
        byte[] accessKeyBytes = secret.getBytes(StandardCharsets.UTF_8);
        byte[] refreshKeyBytes = refreshSecret.getBytes(StandardCharsets.UTF_8);
        if (accessKeyBytes.length < 32) {
            throw new IllegalArgumentException("JWT access secret must be at least 256 bits (32 bytes)");
        }
        if (refreshKeyBytes.length < 32) {
            throw new IllegalArgumentException("JWT refresh secret must be at least 256 bits (32 bytes)");
        }
        this.accessSecretKey = Keys.hmacShaKeyFor(accessKeyBytes);
        this.refreshSecretKey = Keys.hmacShaKeyFor(refreshKeyBytes);
        this.accessTokenExpiryMs = accessExpiryMinutes * 60 * 1000L;
        this.refreshTokenExpiryMs = refreshExpiryDays * 24 * 60 * 60 * 1000L;
    }

    public String generateAccessToken(Long userId, String username, List<String> roles) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("username", username)
                .claim("roles", roles)
                .claim("type", "access")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(accessTokenExpiryMs)))
                .signWith(accessSecretKey)
                .compact();
    }

    public String generateRefreshToken(Long userId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .id(UUID.randomUUID().toString())
                .claim("type", "refresh")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(refreshTokenExpiryMs)))
                .signWith(refreshSecretKey)
                .compact();
    }

    public String generateSigningKey() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    public Claims validateAccessToken(String token) {
        return validateTokenWithKey(token, accessSecretKey);
    }

    public Claims validateRefreshToken(String token) {
        return validateTokenWithKey(token, refreshSecretKey);
    }

    private Claims validateTokenWithKey(String token, SecretKey key) {
        try {
            return Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }

    public Long extractUserId(Claims claims) {
        return Long.parseLong(claims.getSubject());
    }

    public String extractUsername(Claims claims) {
        return claims.get("username", String.class);
    }

    @SuppressWarnings("unchecked")
    public List<String> extractRoles(Claims claims) {
        List<String> roles = claims.get("roles", List.class);
        return roles != null ? roles : Collections.emptyList();
    }

    public long getRefreshTokenExpiryMs() {
        return refreshTokenExpiryMs;
    }
}
