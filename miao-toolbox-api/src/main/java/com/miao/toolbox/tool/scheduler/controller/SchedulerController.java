package com.miao.toolbox.tool.scheduler.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.tool.scheduler.dto.CreateScriptRequest;
import com.miao.toolbox.tool.scheduler.dto.CreateTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.ExecutionListItemResponse;
import com.miao.toolbox.tool.scheduler.dto.ScriptListItemResponse;
import com.miao.toolbox.tool.scheduler.dto.ScriptResponse;
import com.miao.toolbox.tool.scheduler.dto.ScriptVersionResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskExecutionResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskListItemResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskResponse;
import com.miao.toolbox.tool.scheduler.dto.ToggleTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.UpdateScriptRequest;
import com.miao.toolbox.tool.scheduler.dto.UpdateTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.ValidateCronRequest;
import com.miao.toolbox.tool.scheduler.dto.ValidateCronResponse;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.service.SchedulerService;
import com.miao.toolbox.tool.scheduler.service.ScriptService;
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

import java.util.List;

/**
 * 定时任务管理 API（FR-3/FR-4/FR-7/FR-9/FR-13）。
 *
 * <p>V35 改造：移除预置模板列表端点（preset-templates）。
 */
@Slf4j
@RestController
@RequestMapping("/api/scheduler")
@RequireRoute("TOOL_TASK_SCHEDULER")
@RequiredArgsConstructor
public class SchedulerController {

    private final TaskService taskService;
    private final SchedulerService schedulerService;
    private final ScriptService scriptService;

    // ------------------------------------------------------------
    // 脚本管理（FR-1/FR-2）
    // ------------------------------------------------------------

    @PostMapping("/scripts")
    public ResponseEntity<ApiResponse<ScriptResponse>> createScript(@Valid @RequestBody CreateScriptRequest request) {
        return ResponseEntity.ok(ApiResponse.success(scriptService.createScript(request)));
    }

    @GetMapping("/scripts")
    public ResponseEntity<ApiResponse<PagedResponse<ScriptListItemResponse>>> listScripts(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(ApiResponse.success(scriptService.listScripts(page, pageSize, search)));
    }

    @GetMapping("/scripts/{id}")
    public ResponseEntity<ApiResponse<ScriptResponse>> scriptDetail(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(scriptService.getScript(id)));
    }

    @PutMapping("/scripts/{id}")
    public ResponseEntity<ApiResponse<ScriptResponse>> updateScript(@PathVariable Long id,
                                                                     @Valid @RequestBody UpdateScriptRequest request) {
        return ResponseEntity.ok(ApiResponse.success(scriptService.updateScript(id, request)));
    }

    @DeleteMapping("/scripts/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteScript(@PathVariable Long id) {
        scriptService.deleteScript(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @GetMapping("/scripts/{id}/versions")
    public ResponseEntity<ApiResponse<List<ScriptVersionResponse>>> scriptVersions(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(scriptService.listVersions(id)));
    }

    @GetMapping("/scripts/{id}/versions/{version}")
    public ResponseEntity<ApiResponse<ScriptVersionResponse>> scriptVersionDetail(
            @PathVariable Long id, @PathVariable Integer version) {
        return ResponseEntity.ok(ApiResponse.success(scriptService.getVersion(id, version)));
    }

    // ------------------------------------------------------------
    // 任务管理（FR-3/FR-4/FR-7/FR-9/FR-13）
    // ------------------------------------------------------------

    @PostMapping("/tasks")
    public ResponseEntity<ApiResponse<TaskResponse>> create(@Valid @RequestBody CreateTaskRequest request) {
        return ResponseEntity.ok(ApiResponse.success(taskService.createTask(request)));
    }

    @GetMapping("/tasks")
    public ResponseEntity<ApiResponse<PagedResponse<TaskListItemResponse>>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.success(
                taskService.listTasks(page, pageSize, search, parseStatus(status))));
    }

    @GetMapping("/tasks/{id}")
    public ResponseEntity<ApiResponse<TaskResponse>> detail(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(taskService.getTask(id)));
    }

    @PutMapping("/tasks/{id}")
    public ResponseEntity<ApiResponse<TaskResponse>> update(@PathVariable Long id,
                                                            @Valid @RequestBody UpdateTaskRequest request) {
        return ResponseEntity.ok(ApiResponse.success(taskService.updateTask(id, request)));
    }

    @DeleteMapping("/tasks/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        taskService.deleteTask(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PutMapping("/tasks/{id}/toggle")
    public ResponseEntity<ApiResponse<TaskResponse>> toggle(@PathVariable Long id,
                                                            @Valid @RequestBody ToggleTaskRequest request) {
        return ResponseEntity.ok(ApiResponse.success(taskService.toggleTask(id, request.getAction())));
    }

    /** 手动触发（FR-7）：立即异步提交一次执行，响应不等执行完成。 */
    @PostMapping("/tasks/{id}/execute")
    public ResponseEntity<ApiResponse<Void>> execute(@PathVariable Long id) {
        taskService.executeTask(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** cron 校验（FR-4）：5/6 位方言 + 下次 5 次执行时间预览（无副作用）。 */
    @PostMapping("/tasks/validate-cron")
    public ResponseEntity<ApiResponse<ValidateCronResponse>> validateCron(
            @Valid @RequestBody ValidateCronRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                schedulerService.validateCron(request.getExpression(), request.getTimezone())));
    }

    /** 执行历史分页（FR-9）：按 triggered_at 倒序，支持按执行状态筛选。 */
    @GetMapping("/tasks/{id}/executions")
    public ResponseEntity<ApiResponse<PagedResponse<ExecutionListItemResponse>>> executions(
            @PathVariable Long id,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.success(
                taskService.listExecutions(id, page, pageSize, parseExecutionStatus(status))));
    }

    /** 单次执行详情（FR-10）。 */
    @GetMapping("/executions/{id}")
    public ResponseEntity<ApiResponse<TaskExecutionResponse>> executionDetail(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(taskService.getExecution(id)));
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

    private ExecutionStatus parseExecutionStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return ExecutionStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "status 仅支持 SUCCESS / FAILED / TIMEOUT / SKIPPED", 400);
        }
    }
}
