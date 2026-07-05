package com.miao.toolbox.admin.controller;

import com.miao.toolbox.admin.dto.AdminRoleResponse;
import com.miao.toolbox.admin.dto.CreateRoleRequest;
import com.miao.toolbox.admin.dto.UpdateRoleRequest;
import com.miao.toolbox.admin.service.AdminRoleService;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/roles")
@RequiredArgsConstructor
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class AdminRoleController {

    private final AdminRoleService adminRoleService;

    @GetMapping
    public ApiResponse<PagedResponse<AdminRoleResponse>> listRoles(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String search) {
        return ApiResponse.success(adminRoleService.listRoles(page, pageSize, search));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<AdminRoleResponse>> createRole(
            @Valid @RequestBody CreateRoleRequest request) {
        AdminRoleResponse role = adminRoleService.createRole(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(role));
    }

    @PutMapping("/{id}")
    public ApiResponse<AdminRoleResponse> updateRole(
            @PathVariable Long id,
            @Valid @RequestBody UpdateRoleRequest request) {
        return ApiResponse.success(adminRoleService.updateRole(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteRole(@PathVariable Long id) {
        adminRoleService.deleteRole(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
