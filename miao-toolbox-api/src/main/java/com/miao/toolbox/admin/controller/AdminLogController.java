package com.miao.toolbox.admin.controller;

import com.miao.toolbox.admin.dto.AuditLogQuery;
import com.miao.toolbox.admin.dto.AuditLogResponse;
import com.miao.toolbox.admin.service.AuditLogService;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/logs")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminLogController {

    private final AuditLogService auditLogService;

    @GetMapping
    public ApiResponse<PagedResponse<AuditLogResponse>> queryLogs(AuditLogQuery query) {
        return ApiResponse.success(auditLogService.queryLogs(query));
    }
}
