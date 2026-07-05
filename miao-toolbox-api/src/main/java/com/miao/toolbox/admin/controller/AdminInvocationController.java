package com.miao.toolbox.admin.controller;

import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.observability.AiInvocationQueryService;
import com.miao.toolbox.observability.DashboardAiStatsService;
import com.miao.toolbox.observability.dto.AiInvocationQuery;
import com.miao.toolbox.observability.dto.AiInvocationResponse;
import com.miao.toolbox.observability.dto.DashboardAiStatsResponse;
import com.miao.toolbox.observability.dto.UserUsageSummaryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 管理后台 AI 调用日志 API。
 *
 * - GET  /api/admin/ai-invocations/summary     — 仪表盘统计
 * - GET  /api/admin/ai-invocations              — 调用日志列表
 * - GET  /api/admin/ai-invocations/agents       — Agent 下拉选项
 * - GET  /api/admin/ai-invocations/models       — 模型下拉选项
 * - GET  /api/admin/users/{id}/usage-summary    — 用户 AI 用量
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class AdminInvocationController {

    private final DashboardAiStatsService dashboardAiStatsService;
    private final AiInvocationQueryService queryService;

    @GetMapping("/ai-invocations/summary")
    public ApiResponse<DashboardAiStatsResponse> getAiStats() {
        return ApiResponse.success(dashboardAiStatsService.getStats());
    }

    @GetMapping("/ai-invocations")
    public ApiResponse<PagedResponse<AiInvocationResponse>> getInvocations(
            AiInvocationQuery query) {
        return ApiResponse.success(queryService.queryLogs(query));
    }

    @GetMapping("/ai-invocations/agents")
    public ApiResponse<List<String>> getAgentOptions() {
        return ApiResponse.success(queryService.getAgentOptions());
    }

    @GetMapping("/ai-invocations/models")
    public ApiResponse<List<String>> getModelOptions() {
        return ApiResponse.success(queryService.getModelOptions());
    }

    @GetMapping("/users/{id}/usage-summary")
    public ApiResponse<UserUsageSummaryResponse> getUserUsageSummary(
            @PathVariable("id") Long userId) {
        return ApiResponse.success(queryService.getUserUsageSummary(userId));
    }
}
