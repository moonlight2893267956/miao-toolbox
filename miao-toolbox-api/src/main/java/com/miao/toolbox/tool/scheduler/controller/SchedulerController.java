package com.miao.toolbox.tool.scheduler.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.tool.scheduler.dto.CreateTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.TaskListItemResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskResponse;
import com.miao.toolbox.tool.scheduler.dto.ToggleTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.UpdateTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.ValidateCronRequest;
import com.miao.toolbox.tool.scheduler.dto.ValidateCronResponse;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.service.SchedulerService;
import com.miao.toolbox.tool.scheduler.service.TaskService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 定时任务管理 API（FR-1/FR-2/FR-12）。
 *
 * <p>仅超级管理员可访问：路由码 {@code TOOL_TASK_SCHEDULER} 未分配给任何角色，
 * 依赖角色路由体系的默认关闭策略（超级管理员隐式通行，其余 403）。
 */
@Slf4j
@RestController
@RequestMapping("/api/scheduler/tasks")
@RequireRoute("TOOL_TASK_SCHEDULER")
@RequiredArgsConstructor
public class SchedulerController {

    private final TaskService taskService;
    private final SchedulerService schedulerService;

    @PostMapping
    public ResponseEntity<ApiResponse<TaskResponse>> create(@Valid @RequestBody CreateTaskRequest request) {
        return ResponseEntity.ok(ApiResponse.success(taskService.createTask(request)));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<TaskListItemResponse>>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.success(
                taskService.listTasks(page, pageSize, search, parseStatus(status))));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<TaskResponse>> detail(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(taskService.getTask(id)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<TaskResponse>> update(@PathVariable Long id,
                                                            @Valid @RequestBody UpdateTaskRequest request) {
        return ResponseEntity.ok(ApiResponse.success(taskService.updateTask(id, request)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        taskService.deleteTask(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PutMapping("/{id}/toggle")
    public ResponseEntity<ApiResponse<TaskResponse>> toggle(@PathVariable Long id,
                                                            @Valid @RequestBody ToggleTaskRequest request) {
        return ResponseEntity.ok(ApiResponse.success(taskService.toggleTask(id, request.getAction())));
    }

    /** 手动触发（FR-6）：立即异步提交一次执行，响应不等执行完成。 */
    @PostMapping("/{id}/execute")
    public ResponseEntity<ApiResponse<Void>> execute(@PathVariable Long id) {
        taskService.executeTask(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** cron 校验（FR-2）：5/6 位方言 + 下次 5 次执行时间预览（无副作用）。 */
    @PostMapping("/validate-cron")
    public ResponseEntity<ApiResponse<ValidateCronResponse>> validateCron(
            @Valid @RequestBody ValidateCronRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                schedulerService.validateCron(request.getExpression(), request.getTimezone())));
    }

    private TaskStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return TaskStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "status 仅支持 ENABLED / PAUSED", 400);
        }
    }
}
