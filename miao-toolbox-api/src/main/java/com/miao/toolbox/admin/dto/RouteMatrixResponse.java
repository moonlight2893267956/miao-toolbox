package com.miao.toolbox.admin.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Builder
public class RouteMatrixResponse {
    private List<AdminRouteResponse> routes;
    private List<AdminRouteResponse> adminRoutes;
    private List<AdminRoleResponse> roles;
    private Map<String, List<Long>> mappings;
}
