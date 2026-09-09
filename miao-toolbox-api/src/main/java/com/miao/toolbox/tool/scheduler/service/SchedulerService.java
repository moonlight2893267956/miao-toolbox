package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

/**
 * 调度生命周期管理（架构 AR-5，NFR-2/NFR-3）。
 *
 * <p>维护 taskId → {@link ScheduledFuture} 内存表，create/edit/pause/resume/delete
 * 统一经此协调；cron 到点触发回调 {@link ExecutionEngine#triggerScheduled(Long)}
 * （skip 重叠与执行在 ExecutionEngine，线程模型见其类注释）。
 *
 * <p><b>事务边界规则（架构实现模式）：</b>register/unregister 必须在 DB 事务提交后执行，
 * 调用方通过 {@link #runAfterCommit(Runnable)} 注册回调——避免事务回滚后调度残留。
 *
 * <p>单实例（NFR-4）：内存表即全量状态；应用重启后由 SchedulerRecoveryRunner 重建。
 */
@Slf4j
@Service
public class SchedulerService {

    private final ThreadPoolTaskScheduler taskScheduler;
    private final ExecutionEngine executionEngine;

    /** taskId → 调度句柄 */
    private final Map<Long, ScheduledFuture<?>> scheduledFutures = new ConcurrentHashMap<>();

    public SchedulerService(@Qualifier("schedulerTaskScheduler") ThreadPoolTaskScheduler taskScheduler,
                            ExecutionEngine executionEngine) {
        this.taskScheduler = taskScheduler;
        this.executionEngine = executionEngine;
    }

    /**
     * 注册任务调度（幂等：已存在先取消）。触发回调为 ExecutionEngine.triggerScheduled。
     *
     * <p>注册失败（如 cron 非法）仅记录错误不向上抛——afterCommit 回调中的异常
     * 会把已提交事务的请求炸成 500；调度缺失由重启恢复（NFR-2）兜底重建。
     *
     * @return 是否注册成功（重启恢复统计用）
     */
    public boolean register(ScheduledTask task) {
        unregister(task.getId());
        try {
            CronTrigger trigger = new CronTrigger(task.getCronExpression(),
                    ZoneId.of(task.getTimezone()));
            ScheduledFuture<?> future = taskScheduler.schedule(
                    () -> onCronTrigger(task.getId()), trigger);
            scheduledFutures.put(task.getId(), future);
            log.info("[task:{}] scheduler registered, cron={} tz={}",
                    task.getId(), task.getCronExpression(), task.getTimezone());
            return true;
        } catch (Exception e) {
            log.error("[task:{}] scheduler register FAILED, cron={}: {}",
                    task.getId(), task.getCronExpression(), e.getMessage());
            return false;
        }
    }

    /**
     * 取消任务调度。无注册记录时静默（幂等）。
     */
    public void unregister(Long taskId) {
        ScheduledFuture<?> future = scheduledFutures.remove(taskId);
        if (future != null) {
            future.cancel(false);
            log.info("[task:{}] scheduler unregistered", taskId);
        }
    }

    /**
     * 重调度（编辑后调用）：等价 unregister + register。
     */
    public void reschedule(ScheduledTask task) {
        register(task);
    }

    /**
     * 计算任务下次执行时间（列表/详情展示用）。任务未启用或 cron 非法时返回 null。
     */
    public LocalDateTime nextRunAt(ScheduledTask task) {
        if (task.getStatus() == null || task.getStatus() != TaskStatus.ENABLED) {
            return null;
        }
        try {
            ZoneId zone = ZoneId.of(task.getTimezone());
            // CronExpression 按本地时间字段匹配：以目标时区的 now 为基准，
            // 结果即同一时区语义下的下次执行时间（与 CronTrigger 内部行为一致）
            CronExpression expression = CronExpression.parse(task.getCronExpression());
            return expression.next(LocalDateTime.now(zone));
        } catch (Exception e) {
            log.warn("[task:{}] nextRunAt 计算失败: {}", task.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * cron 触发回调（运行在调度线程）——转交执行引擎做 skip 重叠检查与异步执行。
     */
    void onCronTrigger(Long taskId) {
        log.info("[task:{}] cron triggered", taskId);
        executionEngine.triggerScheduled(taskId);
    }

    /**
     * 在当前事务提交后执行动作；无事务时立即执行。
     * 调度生命周期操作（register/unregister/reschedule）必须经由此方法。
     */
    public void runAfterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
