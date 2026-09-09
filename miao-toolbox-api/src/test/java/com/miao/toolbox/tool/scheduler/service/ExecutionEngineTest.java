package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import com.miao.toolbox.tool.scheduler.executor.ExecutionResult;
import com.miao.toolbox.tool.scheduler.executor.TaskExecutor;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ExecutionEngine 执行引擎单元测试（FR-4/FR-7/FR-8/NFR-3）。
 *
 * <p>线程池 mock 为同步执行（doAnswer 直接 run），使异步路径可断言。
 * retryInterval 经实体注入（测试用 0 秒避免真实 sleep）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ExecutionEngine 执行引擎")
class ExecutionEngineTest {

    @Mock
    private ScheduledTaskRepository taskRepository;

    @Mock
    private TaskExecutionRepository executionRepository;

    @Mock
    private TaskExecutor httpExecutor;

    @Mock
    private ThreadPoolTaskExecutor executorPool;

    private ExecutionEngine engine;

    private final AtomicInteger submitted = new AtomicInteger();

    @BeforeEach
    void setUp() {
        engine = new ExecutionEngine(taskRepository, executionRepository,
                List.of(httpExecutor), executorPool);
        // 线程池同步化：submit 的 Runnable 立即执行
        doAnswer(inv -> {
            submitted.incrementAndGet();
            ((Runnable) inv.getArgument(0)).run();
            return null;
        }).when(executorPool).execute(any(Runnable.class));
        when(httpExecutor.supports()).thenReturn(TargetType.HTTP);
    }

    private ScheduledTask enabledTask(Long id, int retryCount, int retryInterval) {
        return ScheduledTask.builder()
                .id(id)
                .name("健康检查")
                .targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://example.com").build())
                .cronExpression("0 */5 * * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED)
                .retryCount(retryCount)
                .retryInterval(retryInterval)
                .timeoutSeconds(30)
                .build();
    }

    @DisplayName("AC1: 触发后异步执行并写入 SUCCESS 记录（trigger_type=SCHEDULED）")
    @Test
    void scheduledTriggerExecutesAndRecords() {
        when(taskRepository.findById(1L)).thenReturn(Optional.of(enabledTask(1L, 0, 0)));
        when(httpExecutor.execute(any())).thenReturn(
                ExecutionResult.of(ExecutionStatus.SUCCESS, "{\"method\":\"GET\"}", "{\"statusCode\":200}", null));

        engine.triggerScheduled(1L);

        ArgumentCaptor<TaskExecution> captor = ArgumentCaptor.forClass(TaskExecution.class);
        verify(executionRepository).save(captor.capture());
        TaskExecution record = captor.getValue();
        assertThat(record.getTriggerType()).isEqualTo(TriggerType.SCHEDULED);
        assertThat(record.getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(record.getStartedAt()).isNotNull();
        assertThat(record.getFinishedAt()).isNotNull();
        assertThat(record.getDurationMs()).isNotNull();
    }

    @DisplayName("AC2: 上一次执行中 → 本次记 SKIPPED（CAS skip）")
    @Test
    void overlapSkipped() {
        when(taskRepository.findById(2L)).thenReturn(Optional.of(enabledTask(2L, 0, 0)));
        // 第一次真实执行期间（running 标志占用中）同步重入触发——setUp 的线程池 mock
        // 会立即运行重入的 Runnable，此时 CAS 失败 → 记 SKIPPED
        AtomicInteger httpCalls = new AtomicInteger();
        when(httpExecutor.execute(any())).thenAnswer(inv -> {
            if (httpCalls.getAndIncrement() == 0) {
                engine.triggerScheduled(2L);
            }
            return ExecutionResult.of(ExecutionStatus.SUCCESS, null, null, null);
        });

        engine.triggerScheduled(2L);

        ArgumentCaptor<TaskExecution> captor = ArgumentCaptor.forClass(TaskExecution.class);
        verify(executionRepository, times(2)).save(captor.capture());
        List<TaskExecution> records = captor.getAllValues();
        assertThat(records).extracting(TaskExecution::getStatus)
                .containsExactlyInAnyOrder(ExecutionStatus.SUCCESS, ExecutionStatus.SKIPPED);
        records.stream().filter(r -> r.getStatus() == ExecutionStatus.SKIPPED)
                .forEach(r -> {
                    assertThat(r.getStartedAt()).isNull();
                    assertThat(r.getFinishedAt()).isNull();
                    assertThat(r.getTriggerType()).isEqualTo(TriggerType.SCHEDULED);
                });
    }

    @DisplayName("AC5: 失败重试至上限记 FAILED，retry_count=尝试次数")
    @Test
    void retriesUpToLimitAndRecordsAttempts() {
        when(taskRepository.findById(3L)).thenReturn(Optional.of(enabledTask(3L, 2, 0)));
        when(httpExecutor.execute(any())).thenReturn(
                ExecutionResult.of(ExecutionStatus.FAILED, null, null, "HTTP 503"));

        engine.triggerScheduled(3L);

        verify(httpExecutor, times(3)).execute(any()); // 1 首发 + 2 重试
        ArgumentCaptor<TaskExecution> captor = ArgumentCaptor.forClass(TaskExecution.class);
        verify(executionRepository).save(captor.capture());
        TaskExecution record = captor.getValue();
        assertThat(record.getStatus()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(record.getRetryCount()).isEqualTo(2);
    }

    @DisplayName("AC5: 重试中途成功记 SUCCESS")
    @Test
    void retrySucceedsOnSecondAttempt() {
        when(taskRepository.findById(4L)).thenReturn(Optional.of(enabledTask(4L, 2, 0)));
        when(httpExecutor.execute(any()))
                .thenReturn(ExecutionResult.of(ExecutionStatus.FAILED, null, null, "HTTP 500"))
                .thenReturn(ExecutionResult.of(ExecutionStatus.SUCCESS, null, null, null));

        engine.triggerScheduled(4L);

        ArgumentCaptor<TaskExecution> captor = ArgumentCaptor.forClass(TaskExecution.class);
        verify(executionRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(captor.getValue().getRetryCount()).isEqualTo(1);
    }

    @DisplayName("竞态防御: SCHEDULED 触发但任务已暂停 → 不执行不记录")
    @Test
    void scheduledTriggerDroppedWhenPaused() {
        ScheduledTask paused = enabledTask(5L, 0, 0);
        paused.setStatus(TaskStatus.PAUSED);
        when(taskRepository.findById(5L)).thenReturn(Optional.of(paused));

        engine.triggerScheduled(5L);

        verify(httpExecutor, never()).execute(any());
        verify(executionRepository, never()).save(any());
    }

    @DisplayName("任务已删除 → 静默返回")
    @Test
    void taskNotFoundSilentlyReturns() {
        when(taskRepository.findById(6L)).thenReturn(Optional.empty());

        engine.triggerScheduled(6L);

        verify(httpExecutor, never()).execute(any());
        verify(executionRepository, never()).save(any());
    }

    @DisplayName("NFR-3: 提交到独立线程池（调度线程不被执行拖住）")
    @Test
    void submissionGoesToExecutorPool() {
        when(taskRepository.findById(7L)).thenReturn(Optional.of(enabledTask(7L, 0, 0)));
        when(httpExecutor.execute(any())).thenReturn(
                ExecutionResult.of(ExecutionStatus.SUCCESS, null, null, null));

        engine.triggerScheduled(7L);

        verify(executorPool, times(1)).execute(any(Runnable.class));
        assertThat(submitted.get()).isEqualTo(1);
    }

    @DisplayName("AC4: 记录落库失败不影响执行结果（log.error 吞异常）")
    @Test
    void recordPersistFailureDoesNotPropagate() {
        when(taskRepository.findById(8L)).thenReturn(Optional.of(enabledTask(8L, 0, 0)));
        when(httpExecutor.execute(any())).thenReturn(
                ExecutionResult.of(ExecutionStatus.SUCCESS, null, null, null));
        when(executionRepository.save(any(TaskExecution.class)))
                .thenThrow(new RuntimeException("db down"));

        engine.triggerScheduled(8L); // 不抛异常即通过

        verify(executionRepository).save(any(TaskExecution.class));
    }
}
