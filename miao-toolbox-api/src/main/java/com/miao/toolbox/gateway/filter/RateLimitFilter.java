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
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

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

    public RateLimitFilter(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
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
            key = RedisKey.RATE_LIMIT_IP_PREFIX + request.getRemoteAddr();
            maxRequests = publicMaxRequests;
            windowSeconds = publicWindowSeconds;
        }

        if (!tryAllow(key, maxRequests, windowSeconds)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            ApiResponse<Void> apiResponse = ApiResponse.error("RATE_LIMIT_EXCEEDED", "请求过于频繁，请稍后再试", null);
            response.getWriter().write(objectMapper.writeValueAsString(apiResponse));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean tryAllow(String key, int maxRequests, int windowSeconds) {
        Instant now = Instant.now();
        double nowScore = now.toEpochMilli();
        double windowStart = now.minus(Duration.ofSeconds(windowSeconds)).toEpochMilli();
        String member = nowScore + ":" + UUID.randomUUID();

        redisTemplate.opsForZSet().add(key, member, nowScore);
        redisTemplate.opsForZSet().removeRangeByScore(key, 0, windowStart);
        Long count = redisTemplate.opsForZSet().count(key, windowStart, Double.POSITIVE_INFINITY);
        redisTemplate.expire(key, Duration.ofSeconds(windowSeconds * 2L));

        return count != null && count <= maxRequests;
    }
}
