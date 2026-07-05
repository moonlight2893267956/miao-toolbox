package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.UpdateRouteMatrixRequest;
import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.entity.Route;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.auth.repository.RouteRepository;
import com.miao.toolbox.auth.service.RouteAccessService;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AdminRouteService 单元测试")
class AdminRouteServiceTest {

    @Mock private RouteRepository routeRepository;
    @Mock private RoleRepository roleRepository;
    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private RouteAccessService routeAccessService;

    @InjectMocks private AdminRouteService adminRouteService;

    @Test
    @DisplayName("更新矩阵时替换指定路由映射并清理缓存")
    void updateMatrixReplacesRequestedRoutes() {
        Route route = Route.builder().id(10L).code("TOOL_CRYPTO").name("加解密工具")
                .path("/tools/crypto").category("TOOL").isAdminRoute(false).isEnabled(true).build();
        Role userRole = Role.builder().id(2L).code("USER").name("普通用户").build();
        Role vipRole = Role.builder().id(3L).code("VIP_USER").name("VIP").build();

        when(routeRepository.findById(10L)).thenReturn(Optional.of(route));
        when(roleRepository.findAllById(List.of(2L, 3L))).thenReturn(List.of(userRole, vipRole));
        when(routeRepository.findAllByOrderByCategoryAscSortOrderAscIdAsc()).thenReturn(List.of(route));
        when(roleRepository.findAll()).thenReturn(List.of(userRole, vipRole));
        doAnswer(invocation -> null).when(jdbcTemplate).query(anyString(), any(RowCallbackHandler.class));

        UpdateRouteMatrixRequest request = new UpdateRouteMatrixRequest();
        request.setMappings(Map.of("10", List.of(2L, 3L)));

        adminRouteService.updateMatrix(request, 1L);

        verify(jdbcTemplate).update("DELETE FROM role_routes WHERE route_id = ?", 10L);
        verify(jdbcTemplate).batchUpdate(eq("INSERT INTO role_routes (role_id, route_id) VALUES (?, ?)"), anyList());
        verify(routeAccessService).evictAllUserRoutes();
    }

    @Test
    @DisplayName("管理区路由不可写入矩阵")
    void updateMatrixRejectsAdminRoutes() {
        Route adminRoute = Route.builder().id(20L).code("ADMIN_USERS").name("用户管理")
                .path("/admin/users").category("ADMIN").isAdminRoute(true).isEnabled(true).build();
        when(routeRepository.findById(20L)).thenReturn(Optional.of(adminRoute));

        UpdateRouteMatrixRequest request = new UpdateRouteMatrixRequest();
        request.setMappings(Map.of("20", List.of(2L)));

        assertThatThrownBy(() -> adminRouteService.updateMatrix(request, 1L))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo("VALIDATION_FAILED");
    }
}
