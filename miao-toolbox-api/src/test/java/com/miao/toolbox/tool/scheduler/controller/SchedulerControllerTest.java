package com.miao.toolbox.tool.scheduler.controller;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.exception.GlobalExceptionHandler;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.tool.scheduler.dto.ExecutionListItemResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskExecutionResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskListItemResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskResponse;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import com.miao.toolbox.tool.scheduler.service.TaskService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SchedulerController 端点路由与响应格式测试（FR-1/FR-12）。
 *
 * <p>standalone MockMvc + 全局异常处理器（BusinessException → HTTP 状态映射、@Valid 校验）。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("SchedulerController")
class SchedulerControllerTest {

    @Mock
    private TaskService taskService;

    @Mock
    private com.miao.toolbox.tool.scheduler.service.SchedulerService schedulerService;

    @InjectMocks
    private SchedulerController controller;

    private MockMvc mvc() {
        return MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private TaskResponse taskResponse(Long id, TaskStatus status) {
        return TaskResponse.builder()
                .id(id)
                .name("健康检查")
                .targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://example.com").build())
                .cronExpression("*/5 * * * *")
                .timezone("Asia/Shanghai")
                .status(status)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(30)
                .build();
    }

    @DisplayName("POST /api/scheduler/tasks 返回 SUCCESS")
    @Test
    void createEndpoint() throws Exception {
        when(taskService.createTask(any())).thenReturn(taskResponse(1L, TaskStatus.ENABLED));

        mvc().perform(post("/api/scheduler/tasks")
                        .contentType("application/json")
                        .content("""
                                {"name":"健康检查","targetType":"HTTP",
                                 "targetConfig":{"targetType":"HTTP","method":"GET","url":"https://example.com"},
                                 "cronExpression":"*/5 * * * *","timezone":"Asia/Shanghai"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(1))
                .andExpect(jsonPath("$.data.status").value("ENABLED"));
    }

    @DisplayName("POST 名称缺失返回 VALIDATION_FAILED（@Valid 生效）")
    @Test
    void createRejectsMissingName() throws Exception {
        mvc().perform(post("/api/scheduler/tasks")
                        .contentType("application/json")
                        .content("""
                                {"targetType":"HTTP",
                                 "targetConfig":{"targetType":"HTTP","method":"GET","url":"https://example.com"},
                                 "cronExpression":"*/5 * * * *"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @DisplayName("GET /api/scheduler/tasks 分页返回列表")
    @Test
    void listEndpoint() throws Exception {
        when(taskService.listTasks(1, 20, "健康", TaskStatus.ENABLED))
                .thenReturn(new PagedResponse<>(List.of(
                        TaskListItemResponse.builder()
                                .id(1L).name("健康检查").targetType(TargetType.HTTP)
                                .cronExpression("*/5 * * * *").status(TaskStatus.ENABLED)
                                .build()), 1, 1, 20));

        mvc().perform(get("/api/scheduler/tasks")
                        .param("page", "1").param("pageSize", "20")
                        .param("search", "健康").param("status", "ENABLED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].name").value("健康检查"));
    }

    @DisplayName("GET 非法 status 返回 400 VALIDATION_FAILED")
    @Test
    void listRejectsInvalidStatus() throws Exception {
        mvc().perform(get("/api/scheduler/tasks").param("status", "RUNNING"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @DisplayName("GET /{id} 详情")
    @Test
    void detailEndpoint() throws Exception {
        when(taskService.getTask(1L)).thenReturn(taskResponse(1L, TaskStatus.ENABLED));

        mvc().perform(get("/api/scheduler/tasks/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("健康检查"));
    }

    @DisplayName("PUT /{id} 编辑")
    @Test
    void updateEndpoint() throws Exception {
        when(taskService.updateTask(eq(1L), any())).thenReturn(taskResponse(1L, TaskStatus.ENABLED));

        mvc().perform(put("/api/scheduler/tasks/1")
                        .contentType("application/json")
                        .content("""
                                {"name":"健康检查v2","targetType":"HTTP",
                                 "targetConfig":{"targetType":"HTTP","method":"GET","url":"https://example.com/v2"},
                                 "cronExpression":"*/10 * * * *"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));
    }

    @DisplayName("DELETE /{id} 删除")
    @Test
    void deleteEndpoint() throws Exception {
        mvc().perform(delete("/api/scheduler/tasks/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));
        verify(taskService).deleteTask(1L);
    }

    @DisplayName("PUT /{id}/toggle pause")
    @Test
    void toggleEndpoint() throws Exception {
        when(taskService.toggleTask(eq(1L), eq("pause")))
                .thenReturn(taskResponse(1L, TaskStatus.PAUSED));

        mvc().perform(put("/api/scheduler/tasks/1/toggle")
                        .contentType("application/json")
                        .content("{\"action\":\"pause\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PAUSED"));
    }

    @DisplayName("业务异常映射：NOT_FOUND 任务返回 404")
    @Test
    void notFoundMapped() throws Exception {
        when(taskService.getTask(404L))
                .thenThrow(new BusinessException(
                        "SCHEDULER_TASK_NOT_FOUND", "任务不存在：404", 404));

        mvc().perform(get("/api/scheduler/tasks/404"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SCHEDULER_TASK_NOT_FOUND"));
    }

    @DisplayName("POST /{id}/execute 手动触发返回 SUCCESS（ts-1-4）")
    @Test
    void executeEndpoint() throws Exception {
        mvc().perform(post("/api/scheduler/tasks/1/execute"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));
        org.mockito.Mockito.verify(taskService).executeTask(1L);
    }

    @DisplayName("POST /validate-cron 有效表达式返回规范化 + 5 次预览（ts-1-4）")
    @Test
    void validateCronEndpoint() throws Exception {
        when(schedulerService.validateCron("*/5 * * * *", "Asia/Shanghai"))
                .thenReturn(com.miao.toolbox.tool.scheduler.dto.ValidateCronResponse.builder()
                        .valid(true)
                        .normalizedExpression("0 */5 * * * *")
                        .nextRuns(java.util.List.of(
                                java.time.LocalDateTime.now().plusMinutes(5),
                                java.time.LocalDateTime.now().plusMinutes(10)))
                        .build());

        mvc().perform(post("/api/scheduler/tasks/validate-cron")
                        .contentType("application/json")
                        .content("{\"expression\":\"*/5 * * * *\",\"timezone\":\"Asia/Shanghai\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.valid").value(true))
                .andExpect(jsonPath("$.data.normalizedExpression").value("0 */5 * * * *"))
                .andExpect(jsonPath("$.data.nextRuns.length()").value(2));
    }

    @DisplayName("POST /validate-cron 无效表达式返回 valid=false（ts-1-4）")
    @Test
    void validateCronInvalidExpression() throws Exception {
        when(schedulerService.validateCron("bad-cron", null))
                .thenReturn(com.miao.toolbox.tool.scheduler.dto.ValidateCronResponse.builder()
                        .valid(false)
                        .error("cron 表达式无效：bad-cron")
                        .build());

        mvc().perform(post("/api/scheduler/tasks/validate-cron")
                        .contentType("application/json")
                        .content("{\"expression\":\"bad-cron\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.valid").value(false))
                .andExpect(jsonPath("$.data.error").isNotEmpty());
    }

    // ------------------------------------------------------------
    // 执行历史与详情（FR-9，ts-1-5）
    // ------------------------------------------------------------

    @DisplayName("GET /tasks/{id}/executions 分页返回执行历史（ts-1-5）")
    @Test
    void executionsEndpoint() throws Exception {
        when(taskService.listExecutions(1L, 1, 20, ExecutionStatus.FAILED))
                .thenReturn(new PagedResponse<>(List.of(
                        ExecutionListItemResponse.builder()
                                .id(9L).triggerType(TriggerType.SCHEDULED)
                                .durationMs(88).status(ExecutionStatus.FAILED).retryCount(1)
                                .build()), 1, 1, 20));

        mvc().perform(get("/api/scheduler/tasks/1/executions")
                        .param("page", "1").param("pageSize", "20").param("status", "FAILED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(9))
                .andExpect(jsonPath("$.data.items[0].triggerType").value("SCHEDULED"))
                .andExpect(jsonPath("$.data.items[0].status").value("FAILED"));
    }

    @DisplayName("GET /tasks/{id}/executions 非法 status 返回 400 VALIDATION_FAILED（ts-1-5）")
    @Test
    void executionsRejectsInvalidStatus() throws Exception {
        mvc().perform(get("/api/scheduler/tasks/1/executions").param("status", "BOGUS"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @DisplayName("GET /executions/{id} 返回执行详情（摘要为 JSON 对象）（ts-1-5）")
    @Test
    void executionDetailEndpoint() throws Exception {
        when(taskService.getExecution(9L)).thenReturn(TaskExecutionResponse.builder()
                .id(9L).taskId(1L).triggerType(TriggerType.MANUAL)
                .status(ExecutionStatus.SUCCESS).retryCount(0)
                .requestSummary(Map.<String, Object>of(
                        "method", "GET",
                        "headers", List.of(Map.<String, Object>of(
                                "name", "Authorization", "value", "Bear****2345"))))
                .responseSummary(Map.<String, Object>of("statusCode", 200, "truncated", false))
                .build());

        mvc().perform(get("/api/scheduler/executions/9"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.taskId").value(1))
                .andExpect(jsonPath("$.data.requestSummary.method").value("GET"))
                .andExpect(jsonPath("$.data.requestSummary.headers[0].value").value("Bear****2345"))
                .andExpect(jsonPath("$.data.responseSummary.statusCode").value(200));
    }

    @DisplayName("GET /executions/{id} 不存在返回 404 SCHEDULER_EXECUTION_NOT_FOUND（ts-1-5）")
    @Test
    void executionDetailNotFound() throws Exception {
        when(taskService.getExecution(404L)).thenThrow(new BusinessException(
                "SCHEDULER_EXECUTION_NOT_FOUND", "执行记录不存在：404", 404));

        mvc().perform(get("/api/scheduler/executions/404"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SCHEDULER_EXECUTION_NOT_FOUND"));
    }
}
