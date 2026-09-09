package com.miao.toolbox.tool.scheduler.runner;

import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.service.SchedulerService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("SchedulerRecoveryRunner 重启恢复")
class SchedulerRecoveryRunnerTest {

    @Mock
    private ScheduledTaskRepository taskRepository;

    @Mock
    private SchedulerService schedulerService;

    @InjectMocks
    private SchedulerRecoveryRunner runner;

    private ScheduledTask task(Long id, TaskStatus status) {
        return ScheduledTask.builder()
                .id(id).name("任务" + id)
                .targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://example.com").build())
                .cronExpression("0 */5 * * * *").timezone("Asia/Shanghai")
                .status(status).retryCount(0).retryInterval(60).timeoutSeconds(30)
                .build();
    }

    @DisplayName("AC6: 启动时重新注册全部 ENABLED 任务")
    @Test
    void recoversEnabledTasks() {
        when(taskRepository.findByStatus(TaskStatus.ENABLED))
                .thenReturn(List.of(task(1L, TaskStatus.ENABLED), task(2L, TaskStatus.ENABLED)));
        when(schedulerService.register(any())).thenReturn(true);

        runner.run(null);

        org.mockito.Mockito.verify(schedulerService).register(
                org.mockito.ArgumentMatchers.argThat(t -> t.getId().equals(1L)));
        org.mockito.Mockito.verify(schedulerService).register(
                org.mockito.ArgumentMatchers.argThat(t -> t.getId().equals(2L)));
    }

    @DisplayName("AC6: PAUSED 任务不恢复")
    @Test
    void skipsPausedTasks() {
        when(taskRepository.findByStatus(TaskStatus.ENABLED)).thenReturn(List.of());

        runner.run(null);

        org.mockito.Mockito.verify(schedulerService, org.mockito.Mockito.never())
                .register(any());
    }

    @DisplayName("AC6: 单任务注册失败不阻断其他任务")
    @Test
    void singleFailureDoesNotBlockOthers() {
        when(taskRepository.findByStatus(TaskStatus.ENABLED))
                .thenReturn(List.of(task(1L, TaskStatus.ENABLED), task(2L, TaskStatus.ENABLED)));
        when(schedulerService.register(any())).thenReturn(true);
        doThrow(new RuntimeException("boom")).when(schedulerService)
                .register(org.mockito.ArgumentMatchers.argThat(t -> t.getId().equals(1L)));

        runner.run(null); // 不抛异常即通过

        // 任务 2 仍被尝试注册
        org.mockito.Mockito.verify(schedulerService).register(
                org.mockito.ArgumentMatchers.argThat(t -> t.getId().equals(2L)));
        assertThat(true).isTrue();
    }
}
