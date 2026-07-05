package com.miao.toolbox.auth.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.repository.RouteRepository;
import com.miao.toolbox.common.constant.RedisKey;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class RouteAccessService {

    private static final Duration USER_ROUTES_TTL = Duration.ofSeconds(30);

    private final RouteRepository routeRepository;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;

    /**
     * 检查用户是否有权限访问指定路由码。
     * <p>超级管理员直接放行。非超管优先查 Redis 缓存，未命中则查 DB 并回写缓存。
     *
     * @return true 表示用户有权限访问该路由
     */
    public boolean canAccess(Long userId, Authentication authentication, String routeCode) {
        if (isSuperAdmin(authentication)) {
            return true;
        }
        return getAccessibleRouteCodes(userId, authentication).contains(routeCode);
    }

    @Transactional(readOnly = true)
    public List<String> getAccessibleRouteCodes(Long userId, Authentication authentication) {
        boolean isSuperAdmin = isSuperAdmin(authentication);
        log.debug("[RouteAccess] userId={}, isSuperAdmin={}", userId, isSuperAdmin);
        if (isSuperAdmin) {
            return routeRepository.findAllEnabledCodes();
        }

        String key = RedisKey.USER_ROUTES_PREFIX + userId;
        List<String> cached = getCachedRoutes(key);
        if (cached != null) {
            log.debug("[RouteAccess] userId={}, cached={}", userId, cached);
            return cached;
        }

        List<String> routes = routeRepository.findEnabledCodesByUserId(userId);
        log.debug("[RouteAccess] userId={}, dbRoutes={}", userId, routes);
        cacheRoutes(key, routes);
        return routes;
    }

    public void evictUserRoutes(Long userId) {
        if (redisTemplate == null || userId == null) return;
        redisTemplate.delete(RedisKey.USER_ROUTES_PREFIX + userId);
    }

    public void evictAllUserRoutes() {
        if (redisTemplate == null) return;
        try {
            Set<String> keys = redisTemplate.keys(RedisKey.USER_ROUTES_PREFIX + "*");
            if (keys != null && !keys.isEmpty()) {
                redisTemplate.delete(keys);
            }
        } catch (RuntimeException ex) {
            log.warn("Failed to evict route access cache", ex);
        }
    }

    private boolean isSuperAdmin(Authentication authentication) {
        if (authentication == null) return false;
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch("ROLE_SUPER_ADMIN"::equals);
    }

    private List<String> getCachedRoutes(String key) {
        if (redisTemplate == null) return null;
        Object value = redisTemplate.opsForValue().get(key);
        if (!(value instanceof String raw)) return null;
        if (raw.isBlank()) return Collections.emptyList();
        try {
            return objectMapper.readValue(raw, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            log.warn("Failed to deserialize cached routes, will evict", e);
            redisTemplate.delete(key);
            return null;
        }
    }

    private void cacheRoutes(String key, List<String> routes) {
        if (redisTemplate == null) return;
        try {
            String json = objectMapper.writeValueAsString(routes);
            redisTemplate.opsForValue().set(key, json, USER_ROUTES_TTL);
        } catch (Exception e) {
            log.warn("Failed to serialize routes for cache", e);
        }
    }
}
