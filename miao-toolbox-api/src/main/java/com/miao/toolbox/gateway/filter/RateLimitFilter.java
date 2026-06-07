package com.miao.toolbox.gateway.filter;

import com.miao.toolbox.auth.entity.User;
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
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Slf4j
@Component
@ConditionalOnBean(RedisTemplate.class)
public class RateLimitFilter extends OncePerRequestFilter {

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${miao.rate-limit.authenticated.max-requests:60}")
    private int authenticatedMaxRequests;

    @Value("${miao.rate-limit.public.max-requests:10}")
    private int publicMaxRequests;

    @Value("${miao.rate-limit.authenticated.window-seconds:60}")
    private int authenticatedWindowSeconds;

    @Value("${miao.rate-limit.public.window-seconds:60}")
    private int publicWindowSeconds;

    // #13: Lua script for atomic sliding window rate limiting
    private static final String RATE_LIMIT_LUA_SCRIPT =
            "local key = KEYS[1] " +
            "local now = tonumber(ARGV[1]) " +
            "local window_start = tonumber(ARGV[2]) " +
            "local max_requests = tonumber(ARGV[3]) " +
            "local ttl = tonumber(ARGV[4]) " +
            "redis.call('ZREMRANGEBYSCORE', key, 0, window_start) " +
            "local count = redis.call('ZCARD', key) " +
            "if count < max_requests then " +
            "  redis.call('ZADD', key, now, now .. ':' .. math.random(1, 1000000)) " +
            "  redis.call('EXPIRE', key, ttl) " +
            "  return 1 " +
            "else " +
            "  return 0 " +
            "end";

    private final DefaultRedisScript<Long> rateLimitScript;

    public RateLimitFilter(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.rateLimitScript = new DefaultRedisScript<>(RATE_LIMIT_LUA_SCRIPT, Long.class);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator") || path.startsWith("/swagger-ui") || path.startsWith("/v3/api-docs");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String key;
        int maxRequests;
        int windowSeconds;

        if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof User user) {
            key = RedisKey.RATE_LIMIT_USER_PREFIX + user.getId();
            maxRequests = authenticatedMaxRequests;
            windowSeconds = authenticatedWindowSeconds;
        } else {
            String forwardedFor = request.getHeader("X-Forwarded-For");
            String ip = (forwardedFor != null && !forwardedFor.isBlank())
                    ? forwardedFor.split(",")[0].trim()
                    : request.getRemoteAddr();
            key = RedisKey.RATE_LIMIT_IP_PREFIX + ip;
            maxRequests = publicMaxRequests;
            windowSeconds = publicWindowSeconds;
        }

        if (!tryAllow(key, maxRequests, windowSeconds)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            // #10: 添加 Retry-After 响应头
            response.setHeader("Retry-After", String.valueOf(windowSeconds));
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            ApiResponse<Void> apiResponse = ApiResponse.error("RATE_LIMIT_EXCEEDED", "请求过于频繁，请稍后再试", null);
            response.getWriter().write(objectMapper.writeValueAsString(apiResponse));
            return;
        }

        filterChain.doFilter(request, response);
    }

    /**
     * #13: Atomic sliding window via Lua script.
     */
    private boolean tryAllow(String key, int maxRequests, int windowSeconds) {
        long nowMs = Instant.now().toEpochMilli();
        long windowStartMs = nowMs - (windowSeconds * 1000L);
        long ttlSeconds = windowSeconds * 2L;

        Long result = redisTemplate.execute(
                rateLimitScript,
                List.of(key),
                String.valueOf(nowMs),
                String.valueOf(windowStartMs),
                String.valueOf(maxRequests),
                String.valueOf(ttlSeconds)
        );

        return result != null && result == 1L;
    }
}
