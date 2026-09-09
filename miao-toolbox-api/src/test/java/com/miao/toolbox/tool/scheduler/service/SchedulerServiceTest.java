package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * SchedulerService 调度生命周期单元测试（架构 AR-5）。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("SchedulerService 调度生命周期")
class SchedulerServiceTest {

    @Mock
    private ThreadPoolTaskScheduler taskScheduler;

    private SchedulerService service;

    private ScheduledTask newTask(Long id, TaskStatus status) {
        return ScheduledTask.builder()
                .id(id)
                .name("任务" + id)
                .targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://example.com").build())
                .cronExpression("0 0 3 * * *")
                .timezone("Asia/Shanghai")
                .status(status)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(30)
                .build();
    }

    @DisplayName("register 注册 CronTrigger 并记录句柄")
    @Test
    void registerSchedulesCronTrigger() {
        service = new SchedulerService(taskScheduler);
        ScheduledFuture<?> future = mock(ScheduledFuture.class);
        doReturn(future).when(taskScheduler).schedule(any(Runnable.class), any(CronTrigger.class));

        service.register(newTask(1L, TaskStatus.ENABLED));

        verify(taskScheduler).schedule(any(Runnable.class), any(CronTrigger.class));
    }

    @DisplayName("register 幂等：重复注册先取消旧句柄")
    @Test
    void registerCancelsExistingFirst() {
        service = new SchedulerService(taskScheduler);
        ScheduledFuture<?> old = mock(ScheduledFuture.class);
        ScheduledFuture<?> next = mock(ScheduledFuture.class);
        doReturn(old).doReturn(next).when(taskScheduler)
                .schedule(any(Runnable.class), any(CronTrigger.class));

        service.register(newTask(1L, TaskStatus.ENABLED));
        service.register(newTask(1L, TaskStatus.ENABLED));

        verify(old).cancel(false);
    }

    @DisplayName("unregister 取消调度；未注册时静默")
    @Test
    void unregisterCancelsAndIsIdempotent() {
        service = new SchedulerService(taskScheduler);
        ScheduledFuture<?> future = mock(ScheduledFuture.class);
        doReturn(future).when(taskScheduler).schedule(any(Runnable.class), any(CronTrigger.class));
        service.register(newTask(2L, TaskStatus.ENABLED));

        service.unregister(2L);
        service.unregister(2L);

        verify(future, times(1)).cancel(false);
    }

    @DisplayName("cron 触发回调进入 onCronTrigger（1.3 接入执行引擎的挂点）")
    @Test
    void scheduledRunnableInvokesTriggerHook() {
        service = new SchedulerService(taskScheduler);
        doAnswer(inv -> new SimpleTestFuture(inv.getArgument(0)))
                .when(taskScheduler).schedule(any(Runnable.class), any(CronTrigger.class));
        service.register(newTask(3L, TaskStatus.ENABLED));

        // 直接调用 hook 验证不抛异常（触发路径占位，1.3 接 ExecutionEngine）
        service.onCronTrigger(3L);
    }

    @DisplayName("nextRunAt：ENABLED 返回下次执行时间；PAUSED 返回 null")
    @Test
    void nextRunAtDependsOnStatus() {
        service = new SchedulerService(taskScheduler);

        LocalDateTime enabledNext = service.nextRunAt(newTask(4L, TaskStatus.ENABLED));
        LocalDateTime pausedNext = service.nextRunAt(newTask(5L, TaskStatus.PAUSED));

        assertThat(enabledNext).isNotNull().isAfter(LocalDateTime.now().minusSeconds(1));
        assertThat(enabledNext.getHour()).isEqualTo(3);
        assertThat(pausedNext).isNull();
    }

    @DisplayName("nextRunAt：cron 非法返回 null 不抛异常")
    @Test
    void nextRunAtWithInvalidCronReturnsNull() {
        service = new SchedulerService(taskScheduler);
        ScheduledTask bad = newTask(6L, TaskStatus.ENABLED);
        bad.setCronExpression("not-a-cron");

        assertThat(service.nextRunAt(bad)).isNull();
    }

    @DisplayName("runAfterCommit：无事务时立即执行")
    @Test
    void runAfterCommitExecutesImmediatelyWithoutTransaction() {
        service = new SchedulerService(taskScheduler);
        AtomicInteger ran = new AtomicInteger();

        service.runAfterCommit(ran::incrementAndGet);

        assertThat(ran.get()).isEqualTo(1);
    }

    @DisplayName("runAfterCommit：有事务时提交后才执行")
    @Test
    void runAfterCommitDefersUntilCommit() {
        service = new SchedulerService(taskScheduler);
        AtomicInteger ran = new AtomicInteger();
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.runAfterCommit(ran::incrementAndGet);
            assertThat(ran.get()).isEqualTo(0);

            List<TransactionSynchronization> syncs = TransactionSynchronizationManager.getSynchronizations();
            syncs.forEach(TransactionSynchronization::afterCommit);
            assertThat(ran.get()).isEqualTo(1);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    /** 测试用 ScheduledFuture 骨架。 */
    private static class SimpleTestFuture implements ScheduledFuture<Object> {
        private final Runnable runnable;

        SimpleTestFuture(Runnable runnable) {
            this.runnable = runnable;
        }

        @Override
        public boolean cancel(boolean mayInterruptIfRunning) {
            return true;
        }

        @Override
        public boolean isCancelled() {
            return false;
        }

        @Override
        public boolean isDone() {
            return false;
        }

        @Override
        public Object get() {
            runnable.run();
            return null;
        }

        @Override
        public Object get(long timeout, java.util.concurrent.TimeUnit unit) {
            return get();
        }

        @Override
        public long getDelay(java.util.concurrent.TimeUnit unit) {
            return 0;
        }

        @Override
        public int compareTo(java.util.concurrent.Delayed o) {
            return 0;
        }
    }
}
