package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.AdminRoleResponse;
import com.miao.toolbox.admin.dto.AdminRouteResponse;
import com.miao.toolbox.admin.dto.RouteMatrixResponse;
import com.miao.toolbox.admin.dto.UpdateRouteMatrixRequest;
import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.entity.Route;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.auth.repository.RouteRepository;
import com.miao.toolbox.auth.service.RouteAccessService;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AdminRouteService {

    private final RouteRepository routeRepository;
    private final RoleRepository roleRepository;
    private final JdbcTemplate jdbcTemplate;
    private final RouteAccessService routeAccessService;

    @Transactional(readOnly = true)
    public List<AdminRouteResponse> listRoutes() {
        return routeRepository.findAllByOrderByCategoryAscSortOrderAscIdAsc()
                .stream()
                .map(this::toRouteResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public RouteMatrixResponse getMatrix() {
        List<Route> allRoutes = routeRepository.findAllByOrderByCategoryAscSortOrderAscIdAsc();
        List<Route> matrixRoutes = allRoutes.stream()
                .filter(route -> !Boolean.TRUE.equals(route.getIsAdminRoute()))
                .toList();
        List<Route> adminRoutes = allRoutes.stream()
                .filter(route -> Boolean.TRUE.equals(route.getIsAdminRoute()))
                .toList();

        List<Role> roles = roleRepository.findAll().stream()
                .filter(role -> !"SUPER_ADMIN".equals(role.getCode()))
                .toList();
        Map<String, List<Long>> mappings = loadMappings(matrixRoutes);

        return RouteMatrixResponse.builder()
                .routes(matrixRoutes.stream().map(this::toRouteResponse).toList())
                .adminRoutes(adminRoutes.stream().map(this::toRouteResponse).toList())
                .roles(roles.stream().map(this::toRoleResponse).toList())
                .mappings(mappings)
                .build();
    }

    @Transactional
    public RouteMatrixResponse updateMatrix(UpdateRouteMatrixRequest request, Long operatorId) {
        for (Map.Entry<String, List<Long>> entry : request.getMappings().entrySet()) {
            Long routeId = parseRouteId(entry.getKey());
            Route route = routeRepository.findById(routeId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.ROUTE_NOT_FOUND, "路由不存在", 404));
            if (Boolean.TRUE.equals(route.getIsAdminRoute())) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "管理区路由不可配置权限", 422);
            }

            List<Long> roleIds = sanitizeRoleIds(entry.getValue());
            List<Role> roles = roleRepository.findAllById(roleIds);
            if (roles.size() != roleIds.size()) {
                throw new BusinessException(ErrorCode.ROLE_NOT_FOUND, "包含不存在的角色", 404);
            }
            List<Role> editableRoles = roles.stream()
                    .filter(role -> !"SUPER_ADMIN".equals(role.getCode()))
                    .toList();

            jdbcTemplate.update("DELETE FROM role_routes WHERE route_id = ?", routeId);
            List<Object[]> rows = editableRoles.stream()
                    .map(role -> new Object[]{role.getId(), routeId})
                    .toList();
            if (!rows.isEmpty()) {
                jdbcTemplate.batchUpdate("INSERT INTO role_routes (role_id, route_id) VALUES (?, ?)", rows);
            }
        }

        routeAccessService.evictAllUserRoutes();
        log.info("管理员 {} 更新角色-路由矩阵: routes={}", operatorId, request.getMappings().keySet());
        return getMatrix();
    }

    private Map<String, List<Long>> loadMappings(List<Route> matrixRoutes) {
        Set<Long> matrixRouteIds = matrixRoutes.stream().map(Route::getId).collect(Collectors.toSet());
        Map<String, List<Long>> mappings = new LinkedHashMap<>();
        matrixRoutes.forEach(route -> mappings.put(String.valueOf(route.getId()), new ArrayList<>()));
        if (matrixRouteIds.isEmpty()) {
            return mappings;
        }

        jdbcTemplate.query("""
                SELECT rr.route_id, rr.role_id
                FROM role_routes rr
                INNER JOIN roles r ON r.id = rr.role_id
                WHERE r.code <> 'SUPER_ADMIN'
                ORDER BY rr.route_id ASC, rr.role_id ASC
                """, rs -> {
            long routeId = rs.getLong("route_id");
            if (matrixRouteIds.contains(routeId)) {
                mappings.computeIfAbsent(String.valueOf(routeId), ignored -> new ArrayList<>())
                        .add(rs.getLong("role_id"));
            }
        });
        return mappings;
    }

    private Long parseRouteId(String raw) {
        try {
            return Long.valueOf(raw);
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "路由ID格式无效", 400);
        }
    }

    private List<Long> sanitizeRoleIds(List<Long> roleIds) {
        if (roleIds == null) return List.of();
        return roleIds.stream()
                .distinct()
                .toList();
    }

    private AdminRouteResponse toRouteResponse(Route route) {
        return AdminRouteResponse.builder()
                .id(route.getId())
                .code(route.getCode())
                .name(route.getName())
                .path(route.getPath())
                .category(route.getCategory())
                .icon(route.getIcon())
                .sortOrder(route.getSortOrder())
                .isAdminRoute(route.getIsAdminRoute())
                .isEnabled(route.getIsEnabled())
                .build();
    }

    private AdminRoleResponse toRoleResponse(Role role) {
        AdminRoleResponse resp = new AdminRoleResponse();
        resp.setId(role.getId());
        resp.setCode(role.getCode());
        resp.setName(role.getName());
        resp.setDescription(role.getDescription());
        resp.setIsSystem(role.getIsSystem());
        resp.setUserCount(roleRepository.countUsersByRoleId(role.getId()));
        resp.setCreatedAt(role.getCreatedAt());
        resp.setUpdatedAt(role.getUpdatedAt());
        return resp;
    }
}
