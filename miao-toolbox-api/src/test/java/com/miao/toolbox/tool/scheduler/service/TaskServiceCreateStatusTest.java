package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.tool.scheduler.dto.CreateTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.TaskResponse;
import com.miao.toolbox.tool.scheduler.entity.Script;
import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import com.miao.toolbox.tool.scheduler.entity.ScriptVersion;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptVersionRepository;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * TaskService 创建任务的状态语义（2026-09-13 变更）：
 * 创建后默认 PAUSED，仅显式传 ENABLED 才创建后立即注册调度。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("TaskService 创建任务状态语义")
class TaskServiceCreateStatusTest {

    @Mock
    private ScheduledTaskRepository taskRepository;
    @Mock
    private TaskExecutionRepository executionRepository;
    @Mock
    private ScriptRepository scriptRepository;
    @Mock
    private ScriptVersionRepository scriptVersionRepository;
    @Mock
    private SchedulerService schedulerService;
    @Mock
    private com.miao.toolbox.network.infrastructure.SsrfProtector ssrfProtector;
    @Mock
    private com.miao.toolbox.tool.scheduler.service.ExecutionEngine executionEngine;
    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private TaskService service;

    private Script script;
    private ScriptVersion version;

    @BeforeEach
    void setUp() {
        script = Script.builder()
                .id(1L).name("清理日志").scriptType(ScriptType.SHELL).latestVersion(1)
                .build();
        version = ScriptVersion.builder()
                .id(10L).scriptId(1L).version(1).content("echo ok")
                .build();
    }

    private CreateTaskRequest.CreateTaskRequestBuilder baseRequest() {
        return CreateTaskRequest.builder()
                .name("每日清理")
                .scriptId(1L)
                .scriptVersion(1)
                .cronExpression("0 0 3 * * *")
                .timezone("Asia/Shanghai");
    }

    private void stubScriptExists() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(script));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1))
                .thenReturn(Optional.of(version));
    }

    private void stubSaveAndStatus() {
        when(taskRepository.save(any())).thenAnswer(inv -> {
            var task = (com.miao.toolbox.tool.scheduler.entity.ScheduledTask) inv.getArgument(0);
            if (task.getId() == null) {
                ReflectionTestUtils.setField(task, "id", 7L);
            }
            return task;
        });
        when(executionRepository.findLatestByTaskIds(anyList())).thenReturn(List.<TaskExecution>of());
    }

    @DisplayName("未指定 status → 创建后 PAUSED，不注册调度")
    @Test
    void createDefaultsToPaused() {
        stubScriptExists();
        stubSaveAndStatus();

        TaskResponse response = service.createTask(baseRequest().build());

        assertThat(response.getStatus()).isEqualTo(TaskStatus.PAUSED);
        verify(schedulerService, never()).register(any());
        verify(schedulerService, never()).runAfterCommit(any());
    }

    @DisplayName("显式传 status=ENABLED → 创建后 ENABLED 并注册调度")
    @Test
    void createWithEnabledStatusRegisters() {
        stubScriptExists();
        stubSaveAndStatus();
        // runAfterCommit 直接执行回调，验证注册行为
        doAnswer(inv -> {
            Runnable r = inv.getArgument(0);
            r.run();
            return null;
        }).when(schedulerService).runAfterCommit(any());

        TaskResponse response = service.createTask(baseRequest().status(TaskStatus.ENABLED).build());

        assertThat(response.getStatus()).isEqualTo(TaskStatus.ENABLED);
        ArgumentCaptor<com.miao.toolbox.tool.scheduler.entity.ScheduledTask> captor =
                ArgumentCaptor.forClass(com.miao.toolbox.tool.scheduler.entity.ScheduledTask.class);
        verify(schedulerService).register(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(TaskStatus.ENABLED);
    }

    @DisplayName("传非法 status 值（PAUSED）→ 也按 PAUSED 处理，不注册调度")
    @Test
    void createWithExplicitPausedStaysPaused() {
        stubScriptExists();
        stubSaveAndStatus();

        TaskResponse response = service.createTask(baseRequest().status(TaskStatus.PAUSED).build());

        assertThat(response.getStatus()).isEqualTo(TaskStatus.PAUSED);
        verify(schedulerService, never()).register(any());
    }
}
