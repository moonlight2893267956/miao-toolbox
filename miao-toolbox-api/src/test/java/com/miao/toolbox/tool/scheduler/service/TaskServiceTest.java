package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import com.miao.toolbox.tool.scheduler.dto.CreateTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.TaskResponse;
import com.miao.toolbox.tool.scheduler.dto.UpdateTaskRequest;
import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.PresetTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetHeader;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.InetAddress;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * TaskService CRUD 编排单元测试（FR-1/FR-2/FR-13/FR-14）。
 *
 * <p>runAfterCommit 用 doAnswer 立即执行传入 Runnable（无事务场景语义），
 * 以断言调度生命周期方法（register/unregister/reschedule）确实被调用。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("TaskService 任务 CRUD 编排")
class TaskServiceTest {

    @Mock
    private ScheduledTaskRepository taskRepository;

    @Mock
    private TaskExecutionRepository executionRepository;

    @Mock
    private SchedulerService schedulerService;

    @Mock
    private SchedulerCryptoService cryptoService;

    @Mock
    private SsrfProtector ssrfProtector;

    @Mock
    private ExecutionEngine executionEngine;

    @InjectMocks
    private TaskService taskService;

    private void runAfterCommitImmediately() {
        doAnswer(inv -> {
            ((Runnable) inv.getArgument(0)).run();
            return null;
        }).when(schedulerService).runAfterCommit(any());
    }

    private HttpTargetConfig httpConfig(String url, TargetHeader... headers) {
        return HttpTargetConfig.builder()
                .method("GET")
                .url(url)
                .headers(List.of(headers))
                .body(null)
                .timeoutSeconds(30)
                .build();
    }

    private CreateTaskRequest createRequest(TaskTargetConfig config) {
        return CreateTaskRequest.builder()
                .name("健康检查")
                .description("每 5 分钟")
                .targetType(TargetType.HTTP)
                .targetConfig(config)
                .cronExpression("*/5 * * * *")
                .timezone("Asia/Shanghai")
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(30)
                .build();
    }

    private ScheduledTask savedTask(Long id, String name, TaskTargetConfig config, TaskStatus status) {
        return ScheduledTask.builder()
                .id(id)
                .name(name)
                .targetType(TargetType.HTTP)
                .targetConfig(config)
                // DB 存储的是规范化后的 6 位表达式（写入路径 normalizeCron 保证）
                .cronExpression("0 */5 * * * *")
                .timezone("Asia/Shanghai")
                .status(status)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(30)
                .build();
    }

    // ------------------------------------------------------------
    // 创建
    // ------------------------------------------------------------

    @DisplayName("AC1: 创建成功——敏感 header 加密、保存后注册调度")
    @Test
    void createTaskEncryptsAndRegisters() {
        runAfterCommitImmediately();
        when(taskRepository.existsByName("健康检查")).thenReturn(false);
        when(cryptoService.encrypt("Bearer secret-token")).thenReturn("enc-cipher-text");
        when(taskRepository.save(any(ScheduledTask.class))).thenAnswer(inv -> {
            ScheduledTask t = inv.getArgument(0);
            t.setId(100L);
            return t;
        });

        CreateTaskRequest req = createRequest(httpConfig("https://example.com/health",
                TargetHeader.builder().name("Authorization").value("Bearer secret-token").sensitive(true).build(),
                TargetHeader.builder().name("X-Trace").value("plain-trace").sensitive(false).build()));

        TaskResponse resp = taskService.createTask(req);

        ArgumentCaptor<ScheduledTask> captor = ArgumentCaptor.forClass(ScheduledTask.class);
        verify(taskRepository).save(captor.capture());
        ScheduledTask saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(TaskStatus.ENABLED);
        // 5 位 Unix 方言自动规范化为 6 位（前补秒字段 0）
        assertThat(saved.getCronExpression()).isEqualTo("0 */5 * * * *");
        HttpTargetConfig savedConfig = (HttpTargetConfig) saved.getTargetConfig();
        assertThat(savedConfig.getHeaders().get(0).getValue()).isEqualTo("enc-cipher-text");
        assertThat(savedConfig.getHeaders().get(1).getValue()).isEqualTo("plain-trace");

        verify(schedulerService).register(any(ScheduledTask.class));
        assertThat(resp.getId()).isEqualTo(100L);
        // 响应中敏感值已脱敏
        HttpTargetConfig respConfig = (HttpTargetConfig) resp.getTargetConfig();
        assertThat(respConfig.getHeaders().get(0).getValue()).isEqualTo("****");
        assertThat(respConfig.getHeaders().get(1).getValue()).isEqualTo("plain-trace");
    }

    @DisplayName("AC1: 名称重复返回 SCHEDULER_TASK_NAME_DUPLICATED")
    @Test
    void createTaskRejectsDuplicateName() {
        when(taskRepository.existsByName("健康检查")).thenReturn(true);

        assertThatThrownBy(() -> taskService.createTask(
                createRequest(httpConfig("https://example.com"))))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_TASK_NAME_DUPLICATED");
    }

    @DisplayName("AC1: cron 非法返回 SCHEDULER_CRON_INVALID")
    @Test
    void createTaskRejectsInvalidCron() {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        CreateTaskRequest req = createRequest(httpConfig("https://example.com"));
        req.setCronExpression("not-a-cron");

        assertThatThrownBy(() -> taskService.createTask(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_CRON_INVALID");
    }

    @DisplayName("AC1: 时区非法返回 VALIDATION_FAILED")
    @Test
    void createTaskRejectsInvalidTimezone() {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        CreateTaskRequest req = createRequest(httpConfig("https://example.com"));
        req.setTimezone("Mars/Olympus_Mons");

        assertThatThrownBy(() -> taskService.createTask(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "VALIDATION_FAILED");
    }

    @DisplayName("AC1/FR-13: 非法协议（ftp）返回 SCHEDULER_TARGET_INVALID")
    @Test
    void createTaskRejectsNonHttpProtocol() {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        CreateTaskRequest req = createRequest(httpConfig("ftp://example.com/file"));

        assertThatThrownBy(() -> taskService.createTask(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_TARGET_INVALID");
    }

    @DisplayName("AC1/FR-13: SSRF 拦截透传 NETWORK_SSRF_BLOCKED")
    @Test
    void createTaskPropagatesSsrfBlock() throws Exception {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        when(ssrfProtector.resolveAndValidate("192.168.1.1"))
                .thenThrow(new BusinessException("NETWORK_SSRF_BLOCKED", "内网地址", 400));

        assertThatThrownBy(() -> taskService.createTask(
                createRequest(httpConfig("https://192.168.1.1/admin"))))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "NETWORK_SSRF_BLOCKED");
        verify(taskRepository, never()).save(any());
    }

    @DisplayName("AC1/FR-13: PRESET 目标缺 template 返回 SCHEDULER_TARGET_INVALID")
    @Test
    void createTaskRejectsPresetWithoutTemplate() {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        CreateTaskRequest req = createRequest(PresetTargetConfig.builder().template("").build());

        assertThatThrownBy(() -> taskService.createTask(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_TARGET_INVALID");
    }

    @DisplayName("AC1: HTTP 目标结构不匹配返回 SCHEDULER_TARGET_INVALID")
    @Test
    void createTaskRejectsMismatchedTargetStructure() {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        CreateTaskRequest req = createRequest(PresetTargetConfig.builder().template("X").build());

        assertThatThrownBy(() -> taskService.createTask(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_TARGET_INVALID");
        verify(ssrfProtector, never()).resolveAndValidate(anyString());
    }

    // ------------------------------------------------------------
    // 编辑
    // ------------------------------------------------------------

    @DisplayName("AC2: 编辑成功且启用中触发重调度")
    @Test
    void updateTaskReschedulesEnabledTask() {
        runAfterCommitImmediately();
        ScheduledTask existing = savedTask(7L, "健康检查",
                httpConfig("https://example.com"), TaskStatus.ENABLED);
        when(taskRepository.findById(7L)).thenReturn(java.util.Optional.of(existing));
        when(taskRepository.existsByName("健康检查v2")).thenReturn(false);
        when(taskRepository.save(any(ScheduledTask.class))).thenAnswer(inv -> inv.getArgument(0));
        when(executionRepository.findLatestByTaskIds(anyList())).thenReturn(List.of());

        UpdateTaskRequest req = UpdateTaskRequest.builder()
                .name("健康检查v2")
                .targetType(TargetType.HTTP)
                .targetConfig(httpConfig("https://example.com/v2"))
                .cronExpression("*/10 * * * *")
                .timezone("Asia/Shanghai")
                .build();

        taskService.updateTask(7L, req);

        verify(schedulerService).reschedule(any(ScheduledTask.class));
    }

    @DisplayName("AC2: 敏感 header 占位值保留原密文（不回显明文的回写保护）")
    @Test
    void updateTaskKeepsOriginalCipherForPlaceholder() {
        runAfterCommitImmediately();
        ScheduledTask existing = savedTask(8L, "健康检查",
                httpConfig("https://example.com",
                        TargetHeader.builder().name("Authorization").value("old-cipher").sensitive(true).build()),
                TaskStatus.ENABLED);
        when(taskRepository.findById(8L)).thenReturn(java.util.Optional.of(existing));
        when(taskRepository.save(any(ScheduledTask.class))).thenAnswer(inv -> inv.getArgument(0));
        when(executionRepository.findLatestByTaskIds(anyList())).thenReturn(List.of());

        UpdateTaskRequest req = UpdateTaskRequest.builder()
                .name("健康检查")
                .targetType(TargetType.HTTP)
                .targetConfig(httpConfig("https://example.com",
                        TargetHeader.builder().name("Authorization").value("****").sensitive(true).build()))
                .cronExpression("*/5 * * * *")
                .timezone("Asia/Shanghai")
                .build();

        taskService.updateTask(8L, req);

        ArgumentCaptor<ScheduledTask> captor = ArgumentCaptor.forClass(ScheduledTask.class);
        verify(taskRepository).save(captor.capture());
        HttpTargetConfig config = (HttpTargetConfig) captor.getValue().getTargetConfig();
        assertThat(config.getHeaders().get(0).getValue()).isEqualTo("old-cipher");
        verify(cryptoService, never()).encrypt(anyString());
    }

    @DisplayName("AC2: 编辑不存在的任务返回 SCHEDULER_TASK_NOT_FOUND")
    @Test
    void updateTaskRejectsUnknownId() {
        when(taskRepository.findById(99L)).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> taskService.updateTask(99L, UpdateTaskRequest.builder()
                .name("x").targetType(TargetType.HTTP)
                .targetConfig(httpConfig("https://a.com"))
                .cronExpression("* * * * *").build()))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_TASK_NOT_FOUND");
    }

    // ------------------------------------------------------------
    // 删除 / 启停
    // ------------------------------------------------------------

    @DisplayName("AC3: 删除任务清除执行记录并取消调度")
    @Test
    void deleteTaskRemovesExecutionsAndUnregisters() {
        runAfterCommitImmediately();
        ScheduledTask existing = savedTask(9L, "待删除",
                httpConfig("https://example.com"), TaskStatus.ENABLED);
        when(taskRepository.findById(9L)).thenReturn(java.util.Optional.of(existing));
        when(executionRepository.deleteByTaskId(9L)).thenReturn(3L);

        taskService.deleteTask(9L);

        verify(executionRepository).deleteByTaskId(9L);
        verify(taskRepository).delete(existing);
        verify(schedulerService).unregister(9L);
    }

    @DisplayName("AC4: pause 置 PAUSED 并取消调度")
    @Test
    void togglePauseUnregisters() {
        runAfterCommitImmediately();
        ScheduledTask existing = savedTask(10L, "任务",
                httpConfig("https://example.com"), TaskStatus.ENABLED);
        when(taskRepository.findById(10L)).thenReturn(java.util.Optional.of(existing));
        when(taskRepository.save(any(ScheduledTask.class))).thenAnswer(inv -> inv.getArgument(0));
        when(executionRepository.findLatestByTaskIds(anyList())).thenReturn(List.of());

        TaskResponse resp = taskService.toggleTask(10L, "pause");

        assertThat(resp.getStatus()).isEqualTo(TaskStatus.PAUSED);
        verify(schedulerService).unregister(10L);
        verify(schedulerService, never()).register(any());
    }

    @DisplayName("AC4: resume 置 ENABLED 并重新注册调度")
    @Test
    void toggleResumeRegisters() {
        runAfterCommitImmediately();
        ScheduledTask existing = savedTask(11L, "任务",
                httpConfig("https://example.com"), TaskStatus.PAUSED);
        when(taskRepository.findById(11L)).thenReturn(java.util.Optional.of(existing));
        when(taskRepository.save(any(ScheduledTask.class))).thenAnswer(inv -> inv.getArgument(0));
        when(executionRepository.findLatestByTaskIds(anyList())).thenReturn(List.of());

        TaskResponse resp = taskService.toggleTask(11L, "resume");

        assertThat(resp.getStatus()).isEqualTo(TaskStatus.ENABLED);
        verify(schedulerService).register(any(ScheduledTask.class));
    }

    @DisplayName("AC4: 非法 action 返回 VALIDATION_FAILED")
    @Test
    void toggleRejectsInvalidAction() {
        when(taskRepository.findById(12L)).thenReturn(java.util.Optional.of(
                savedTask(12L, "任务", httpConfig("https://example.com"), TaskStatus.ENABLED)));

        assertThatThrownBy(() -> taskService.toggleTask(12L, "restart"))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "VALIDATION_FAILED");
    }

    // ------------------------------------------------------------
    // 查询
    // ------------------------------------------------------------

    @DisplayName("AC5: 详情含脱敏配置 + 上次执行状态")
    @Test
    void getTaskMasksSensitiveAndResolvesLastStatus() {
        ScheduledTask existing = savedTask(13L, "健康检查",
                httpConfig("https://example.com",
                        TargetHeader.builder().name("Authorization").value("cipher-xyz").sensitive(true).build()),
                TaskStatus.ENABLED);
        when(taskRepository.findById(13L)).thenReturn(java.util.Optional.of(existing));
        when(schedulerService.nextRunAt(any(ScheduledTask.class)))
                .thenReturn(LocalDateTime.now().plusMinutes(3));
        TaskExecution last = TaskExecution.builder()
                .taskId(13L)
                .triggerType(TriggerType.SCHEDULED)
                .status(com.miao.toolbox.tool.scheduler.entity.ExecutionStatus.FAILED)
                .retryCount(0)
                .build();
        when(executionRepository.findLatestByTaskIds(List.of(13L))).thenReturn(List.of(last));

        TaskResponse resp = taskService.getTask(13L);

        HttpTargetConfig config = (HttpTargetConfig) resp.getTargetConfig();
        assertThat(config.getHeaders().get(0).getValue()).isEqualTo("****");
        assertThat(resp.getLastExecutionStatus()).isEqualTo("FAILED");
        assertThat(resp.getNextRunAt()).isNotNull();
    }

    // ------------------------------------------------------------
    // Code review patch 覆盖（P3/P4）
    // ------------------------------------------------------------

    @DisplayName("[P3] 创建时敏感 header 为占位值且无历史值 → 拒绝")
    @Test
    void createTaskRejectsPlaceholderWithoutHistory() {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        CreateTaskRequest req = createRequest(httpConfig("https://example.com",
                TargetHeader.builder().name("Authorization").value("****").sensitive(true).build()));

        assertThatThrownBy(() -> taskService.createTask(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_TARGET_INVALID")
                .hasMessageContaining("Authorization");
        verify(taskRepository, never()).save(any());
    }

    @DisplayName("[P3] 编辑时敏感 header 改名 + 占位值 → 拒绝（防密钥静默丢失）")
    @Test
    void updateTaskRejectsRenamedHeaderWithPlaceholder() {
        ScheduledTask existing = savedTask(14L, "健康检查",
                httpConfig("https://example.com",
                        TargetHeader.builder().name("Authorization").value("old-cipher").sensitive(true).build()),
                TaskStatus.ENABLED);
        when(taskRepository.findById(14L)).thenReturn(java.util.Optional.of(existing));

        UpdateTaskRequest req = UpdateTaskRequest.builder()
                .name("健康检查")
                .targetType(TargetType.HTTP)
                .targetConfig(httpConfig("https://example.com",
                        // header 改名为 X-Token，占位值在旧密文中无对应——拒绝
                        TargetHeader.builder().name("X-Token").value("****").sensitive(true).build()))
                .cronExpression("*/5 * * * *")
                .timezone("Asia/Shanghai")
                .build();

        assertThatThrownBy(() -> taskService.updateTask(14L, req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_TARGET_INVALID")
                .hasMessageContaining("X-Token");
    }

    @DisplayName("[P4] Webhook URL 内网地址 → 保存时 NETWORK_SSRF_BLOCKED 拒绝")
    @Test
    void createTaskRejectsInternalWebhookUrl() throws Exception {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        // 先过目标 URL 的 SSRF（公网放行），再校验 Webhook URL 时拦截内网
        when(ssrfProtector.resolveAndValidate("example.com"))
                .thenReturn(InetAddress.getByName("93.184.216.34"));
        when(ssrfProtector.resolveAndValidate("10.0.0.5"))
                .thenThrow(new BusinessException("NETWORK_SSRF_BLOCKED", "内网地址", 400));

        CreateTaskRequest req = createRequest(httpConfig("https://example.com"));
        req.setNotifyConfig(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.builder()
                .webhook(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.WebhookNotify.builder()
                        .url("http://10.0.0.5/hook")
                        .trigger(com.miao.toolbox.tool.scheduler.entity.NotifyTrigger.ON_FAILURE)
                        .build())
                .build());

        assertThatThrownBy(() -> taskService.createTask(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "NETWORK_SSRF_BLOCKED");
        verify(taskRepository, never()).save(any());
    }

    @DisplayName("[P4] Webhook URL 非法协议 → SCHEDULER_TARGET_INVALID")
    @Test
    void createTaskRejectsWebhookWithBadProtocol() {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        CreateTaskRequest req = createRequest(httpConfig("https://example.com"));
        req.setNotifyConfig(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.builder()
                .webhook(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.WebhookNotify.builder()
                        .url("ftp://example.com/hook")
                        .build())
                .build());

        assertThatThrownBy(() -> taskService.createTask(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_TARGET_INVALID")
                .hasMessageContaining("Webhook");
    }

    @DisplayName("[P4] 通知邮箱格式无效 → VALIDATION_FAILED")
    @Test
    void createTaskRejectsInvalidEmailRecipient() {
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        CreateTaskRequest req = createRequest(httpConfig("https://example.com"));
        req.setNotifyConfig(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.builder()
                .email(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.EmailNotify.builder()
                        .recipients(List.of("admin@example.com", "not-an-email"))
                        .build())
                .build());

        assertThatThrownBy(() -> taskService.createTask(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "VALIDATION_FAILED")
                .hasMessageContaining("not-an-email");
    }

    @DisplayName("[P4] 通知配置 trigger 缺省兜底 ON_FAILURE + 全空配置归一为 null")
    @Test
    void notifyTriggerDefaultsAndEmptyNormalizesToNull() {
        runAfterCommitImmediately();
        when(taskRepository.existsByName(anyString())).thenReturn(false);
        when(taskRepository.save(any(ScheduledTask.class))).thenAnswer(inv -> {
            ScheduledTask t = inv.getArgument(0);
            t.setId(20L);
            return t;
        });
        // webhook URL 配置但 trigger 未传（Jackson 反序列化 null 场景）
        CreateTaskRequest req = createRequest(httpConfig("https://example.com"));
        req.setNotifyConfig(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.builder()
                .webhook(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.WebhookNotify.builder()
                        .url("https://open.feishu.cn/hook/abc")
                        .build())
                .build());

        taskService.createTask(req);

        ArgumentCaptor<ScheduledTask> captor = ArgumentCaptor.forClass(ScheduledTask.class);
        verify(taskRepository).save(captor.capture());
        com.miao.toolbox.tool.scheduler.entity.NotifyConfig notify = captor.getValue().getNotifyConfig();
        assertThat(notify.getWebhook().getTrigger())
                .isEqualTo(com.miao.toolbox.tool.scheduler.entity.NotifyTrigger.ON_FAILURE);

        // 全空配置（对象存在但 URL 空、无收件人）归一为 null = 不通知
        CreateTaskRequest emptyNotify = createRequest(httpConfig("https://example.com"));
        emptyNotify.setNotifyConfig(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.builder()
                .webhook(com.miao.toolbox.tool.scheduler.entity.NotifyConfig.WebhookNotify.builder()
                        .url("").build())
                .build());
        when(taskRepository.existsByName("健康检查")).thenReturn(false);
        when(taskRepository.save(any(ScheduledTask.class))).thenAnswer(inv -> {
            ScheduledTask t = inv.getArgument(0);
            t.setId(21L);
            return t;
        });
        taskService.createTask(emptyNotify);
        ArgumentCaptor<ScheduledTask> captor2 = ArgumentCaptor.forClass(ScheduledTask.class);
        verify(taskRepository, times(2)).save(captor2.capture());
        assertThat(captor2.getAllValues().get(1).getNotifyConfig()).isNull();
    }

    // ------------------------------------------------------------
    // 手动触发（FR-6，ts-1-4）
    // ------------------------------------------------------------

    @DisplayName("AC1: 手动触发提交 ExecutionEngine.triggerManual")
    @Test
    void executeTaskSubmitsManualTrigger() {
        ScheduledTask existing = savedTask(30L, "健康检查",
                httpConfig("https://example.com"), TaskStatus.PAUSED);
        when(taskRepository.findById(30L)).thenReturn(java.util.Optional.of(existing));

        taskService.executeTask(30L);

        verify(executionEngine).triggerManual(30L);
    }

    @DisplayName("AC1: 手动触发不存在的任务返回 SCHEDULER_TASK_NOT_FOUND")
    @Test
    void executeTaskRejectsUnknownId() {
        when(taskRepository.findById(99L)).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> taskService.executeTask(99L))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SCHEDULER_TASK_NOT_FOUND");
        verify(executionEngine, never()).triggerManual(any());
    }
}
