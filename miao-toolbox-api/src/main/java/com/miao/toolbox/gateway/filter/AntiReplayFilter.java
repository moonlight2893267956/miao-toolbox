package com.miao.toolbox.gateway.filter;

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
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;

@Slf4j
@Component
@ConditionalOnBean(RedisTemplate.class)
public class AntiReplayFilter extends OncePerRequestFilter {

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${miao.anti-replay.timestamp-tolerance-minutes:5}")
    private int timestampToleranceMinutes;

    @Value("${miao.anti-replay.nonce-ttl-seconds:300}")
    private int nonceTtlSeconds;

    public AntiReplayFilter(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/auth/") || path.startsWith("/actuator")
                || path.startsWith("/swagger-ui") || path.startsWith("/v3/api-docs");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String timestamp = request.getHeader("X-Request-Timestamp");
        String nonce = request.getHeader("X-Request-Nonce");
        String signature = request.getHeader("X-Request-Signature");

        if (timestamp == null || nonce == null || signature == null) {
            writeError(response, "REPLAY_PROTECTION_FAILED", "缺少防重放请求头");
            return;
        }

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

        String nonceKey = RedisKey.NONCE_PREFIX + nonce;
        Boolean nonceExists = redisTemplate.hasKey(nonceKey);
        if (Boolean.TRUE.equals(nonceExists)) {
            writeError(response, "REPLAY_NONCE_USED", "请求已被使用过");
            return;
        }

        redisTemplate.opsForValue().set(nonceKey, "1", Duration.ofSeconds(nonceTtlSeconds));

        filterChain.doFilter(request, response);
    }

    private void writeError(HttpServletResponse response, String errorCode, String message) throws IOException {
        response.setStatus(HttpStatus.BAD_REQUEST.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        ApiResponse<Void> apiResponse = ApiResponse.error(errorCode, message, null);
        response.getWriter().write(objectMapper.writeValueAsString(apiResponse));
    }
}
