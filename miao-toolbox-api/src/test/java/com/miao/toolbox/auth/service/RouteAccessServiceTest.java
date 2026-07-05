package com.miao.toolbox.auth.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.repository.RouteRepository;
import com.miao.toolbox.common.constant.RedisKey;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("RouteAccessService 单元测试")
class RouteAccessServiceTest {

    @Mock private RouteRepository routeRepository;
    @Mock private RedisTemplate<String, Object> redisTemplate;
    @Mock private ValueOperations<String, Object> valueOperations;

    @InjectMocks private RouteAccessService routeAccessService;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        // 注入 RedisTemplate 和使用真实 ObjectMapper（避免为 JSON 序列化 mock）
        ReflectionTestUtils.setField(routeAccessService, "redisTemplate", redisTemplate);
        ReflectionTestUtils.setField(routeAccessService, "objectMapper", new ObjectMapper());
    }

    @Test
    @DisplayName("超级管理员返回全部启用路由")
    void superAdminGetsAllEnabledRoutes() {
        var auth = new UsernamePasswordAuthenticationToken(
                "admin",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN"))
        );
        when(routeRepository.findAllEnabledCodes()).thenReturn(List.of("TOOL_TEXT_COMPARE", "ADMIN_USERS"));

        List<String> routes = routeAccessService.getAccessibleRouteCodes(1L, auth);

        assertThat(routes).containsExactly("TOOL_TEXT_COMPARE", "ADMIN_USERS");
        verify(routeRepository).findAllEnabledCodes();
        verify(routeRepository, never()).findEnabledCodesByUserId(anyLong());
    }

    @Test
    @DisplayName("普通用户缓存未命中时查询 DB 并写入 Redis（JSON 序列化）")
    void normalUserCacheMissQueriesDb() {
        var auth = new UsernamePasswordAuthenticationToken(
                "user",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get(RedisKey.USER_ROUTES_PREFIX + 2L)).thenReturn(null);
        when(routeRepository.findEnabledCodesByUserId(2L)).thenReturn(List.of("TOOL_JSON_WORKBENCH"));

        List<String> routes = routeAccessService.getAccessibleRouteCodes(2L, auth);

        assertThat(routes).containsExactly("TOOL_JSON_WORKBENCH");
        // 缓存在 JSON 序列化后写入：["TOOL_JSON_WORKBENCH"]
        verify(valueOperations).set(eq(RedisKey.USER_ROUTES_PREFIX + 2L),
                argThat(val -> val instanceof String s && s.contains("TOOL_JSON_WORKBENCH")),
                any(Duration.class));
    }

    @Test
    @DisplayName("普通用户缓存命中时直接返回，不查 DB")
    void normalUserCacheHitReturnsCached() throws Exception {
        var auth = new UsernamePasswordAuthenticationToken(
                "user",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        ObjectMapper mapper = new ObjectMapper();
        String cachedJson = mapper.writeValueAsString(List.of("TOOL_CRYPTO", "PAGE_SETTINGS"));
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get(RedisKey.USER_ROUTES_PREFIX + 3L)).thenReturn(cachedJson);

        List<String> routes = routeAccessService.getAccessibleRouteCodes(3L, auth);

        assertThat(routes).containsExactly("TOOL_CRYPTO", "PAGE_SETTINGS");
        verify(routeRepository, never()).findEnabledCodesByUserId(anyLong());
    }

    @Test
    @DisplayName("矩阵变更时清理所有用户路由缓存")
    void evictAllUserRoutesDeletesMatchingKeys() {
        when(redisTemplate.keys(RedisKey.USER_ROUTES_PREFIX + "*"))
                .thenReturn(Set.of(RedisKey.USER_ROUTES_PREFIX + "1", RedisKey.USER_ROUTES_PREFIX + "2"));

        routeAccessService.evictAllUserRoutes();

        verify(redisTemplate).delete(Set.of(RedisKey.USER_ROUTES_PREFIX + "1", RedisKey.USER_ROUTES_PREFIX + "2"));
    }
}
