package com.miao.toolbox.gateway.filter;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.RedisKey;
import com.miao.toolbox.common.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;

@Slf4j
@Component
@ConditionalOnBean(RedisTemplate.class)
public class AntiReplayFilter extends OncePerRequestFilter {

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    private final UserRepository userRepository;

    @Value("${miao.anti-replay.timestamp-tolerance-minutes:5}")
    private int timestampToleranceMinutes;

    @Value("${miao.anti-replay.nonce-ttl-seconds:300}")
    private int nonceTtlSeconds;

    public AntiReplayFilter(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper, UserRepository userRepository) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.userRepository = userRepository;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/auth/login")
                || path.startsWith("/api/auth/register")
                || path.startsWith("/api/auth/refresh")
                || path.startsWith("/api/auth/oauth/")
                || path.startsWith("/actuator")
                || path.startsWith("/swagger-ui")
                || path.startsWith("/v3/api-docs")
                || path.startsWith("/api/network/webhook/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // 包装 request 以便读取 body（且供后续 Controller 重复消费）
        CachedBodyHttpServletRequest cachedRequest = new CachedBodyHttpServletRequest(request);

        String timestamp = cachedRequest.getHeader("X-Request-Timestamp");
        String nonce = cachedRequest.getHeader("X-Request-Nonce");
        String signature = cachedRequest.getHeader("X-Request-Signature");

        if (timestamp == null || nonce == null || signature == null) {
            writeError(response, "REPLAY_PROTECTION_FAILED", "缺少防重放请求头");
            return;
        }

        // Validate timestamp
        try {
            long timestampMs = Long.parseLong(timestamp);
            long now = Instant.now().toEpochMilli();
            long tolerance = timestampToleranceMinutes * 60_000L;
            if (Math.abs(now - timestampMs) > tolerance) {
                writeError(response, "REPLAY_TIMESTAMP_EXPIRED", "请求时间戳已过期");
                return;
            }
        } catch (NumberFormatException e) {
            writeError(response, "REPLAY_TIMESTAMP_INVALID", "请求时间戳格式错误");
            return;
        }

        // #12: Use SETNX for atomic nonce check (prevents TOCTOU race)
        String nonceKey = RedisKey.NONCE_PREFIX + nonce;
        Boolean setSuccess = redisTemplate.opsForValue().setIfAbsent(nonceKey, "1", Duration.ofSeconds(nonceTtlSeconds));
        if (Boolean.FALSE.equals(setSuccess)) {
            writeError(response, "REPLAY_NONCE_USED", "请求已被使用过");
            return;
        }

        // #3: Verify HMAC-SHA256 signature (签名数据：timestamp + nonce + body)
        String signingKey = resolveSigningKey();
        if (signingKey != null) {
            String data = timestamp + nonce + readBody(cachedRequest);
            String expectedSignature = computeHmac(signingKey, data);
            if (!MessageDigest.isEqual(expectedSignature.getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8))) {
                // Try transition key — resolveSigningKey returns the NEW key from user entity.
                // Reverse mapping: SIGNING_KEY_TRANSITION_PREFIX + newKey -> oldKey
                String reverseKey = RedisKey.SIGNING_KEY_TRANSITION_PREFIX + signingKey;
                Object oldSigningKey = redisTemplate.opsForValue().get(reverseKey);
                if (oldSigningKey != null) {
                    String expectedWithOldKey = computeHmac((String) oldSigningKey, data);
                    if (!MessageDigest.isEqual(expectedWithOldKey.getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8))) {
                        writeError(response, "REPLAY_SIGNATURE_INVALID", "请求签名验证失败");
                        return;
                    }
                } else {
                    writeError(response, "REPLAY_SIGNATURE_INVALID", "请求签名验证失败");
                    return;
                }
            }
        }

        filterChain.doFilter(cachedRequest, response);
    }

    /**
     * Resolve the signing key for the current user from SecurityContext or DB.
     */
    private String resolveSigningKey() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof User user) {
            return user.getSigningKey();
        }
        return null;
    }

    /**
     * #3: Compute HMAC-SHA256 signature.
     */
    private String computeHmac(String key, String data) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            SecretKeySpec secretKeySpec = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
            mac.init(secretKeySpec);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(hash);
        } catch (Exception e) {
            log.error("HMAC computation failed", e);
            return "";
        }
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    /**
     * 读取请求 body 用于签名计算。
     * 对 GET/DELETE 不读 body；其他方法从包装后的 request 读取。
     */
    private String readBody(HttpServletRequest request) {
        if ("GET".equalsIgnoreCase(request.getMethod()) || "DELETE".equalsIgnoreCase(request.getMethod())) {
            return "";
        }
        if (request instanceof CachedBodyHttpServletRequest cached) {
            return cached.getBodyAsString();
        }
        return "";
    }

    private void writeError(HttpServletResponse response, String errorCode, String message) throws IOException {
        response.setStatus(HttpStatus.BAD_REQUEST.value());
        // 显式设置 UTF-8 字符集，避免 Servlet 默认 ISO-8859-1 把中文变成问号
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        ApiResponse<Void> apiResponse = ApiResponse.error(errorCode, message, null);
        response.getWriter().write(objectMapper.writeValueAsString(apiResponse));
    }
}
