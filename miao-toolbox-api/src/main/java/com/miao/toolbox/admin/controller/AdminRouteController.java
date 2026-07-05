package com.miao.toolbox.admin.controller;

import com.miao.toolbox.admin.dto.AdminRouteResponse;
import com.miao.toolbox.admin.dto.RouteMatrixResponse;
import com.miao.toolbox.admin.dto.UpdateRouteMatrixRequest;
import com.miao.toolbox.admin.service.AdminRouteService;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/routes")
@RequiredArgsConstructor
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class AdminRouteController {

    private final AdminRouteService adminRouteService;

    @GetMapping
    public ApiResponse<List<AdminRouteResponse>> listRoutes() {
        return ApiResponse.success(adminRouteService.listRoutes());
    }

    @GetMapping("/matrix")
    public ApiResponse<RouteMatrixResponse> getMatrix() {
        return ApiResponse.success(adminRouteService.getMatrix());
    }

    @PutMapping("/matrix")
    public ApiResponse<RouteMatrixResponse> updateMatrix(
            @Valid @RequestBody UpdateRouteMatrixRequest request,
            @AuthenticationPrincipal Object principal) {
        Long operatorId = principal instanceof User user ? user.getId() : null;
        return ApiResponse.success(adminRouteService.updateMatrix(request, operatorId));
    }
}
