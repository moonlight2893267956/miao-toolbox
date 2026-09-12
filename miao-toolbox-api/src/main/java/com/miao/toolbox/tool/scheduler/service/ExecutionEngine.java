package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import com.miao.toolbox.tool.scheduler.executor.ExecutionResult;
import com.miao.toolbox.tool.scheduler.executor.TaskExecutor;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 执行引擎（FR-6/FR-7/FR-8/NFR-3/NFR-5）——任务触发 → skip 重叠 → 异步执行 → 重试 → 记录落库。
 *
 * <p>V35 改造：移除 TargetType 分发，改为单一脚本执行器（ScriptTaskExecutor，后续 Story 2.3 交付）。
 * 在执行器注册前，dispatch 返回 FAILED（无可用执行器）。
 */
@Slf4j
@Service
public class ExecutionEngine {

    private final ScheduledTaskRepository taskRepository;
    private final TaskExecutionRepository executionRepository;
    private final List<TaskExecutor> executors;
    private final ThreadPoolTaskExecutor executor;
    private final NotificationService notificationService;

    /** taskId → 是否执行中（skip 重叠，单实例内存态，NFR-4） */
    private final Map<Long, AtomicBoolean> runningFlags = new ConcurrentHashMap<>();

    public ExecutionEngine(ScheduledTaskRepository taskRepository,
                           TaskExecutionRepository executionRepository,
                           List<TaskExecutor> executors,
                           @Qualifier("schedulerTaskExecutor") ThreadPoolTaskExecutor executor,
                           NotificationService notificationService) {
        this.taskRepository = taskRepository;
        this.executionRepository = executionRepository;
        this.executors = executors;
        this.executor = executor;
        this.notificationService = notificationService;
    }

    /** cron 调度触发入口（SchedulerService.onCronTrigger 调用，运行在调度线程） */
    public void triggerScheduled(Long taskId) {
        submit(taskId, TriggerType.SCHEDULED);
    }

    /** 手动触发入口（Controller 调用） */
    public void triggerManual(Long taskId) {
        submit(taskId, TriggerType.MANUAL);
    }

    private void submit(Long taskId, TriggerType triggerType) {
        try {
            executor.execute(() -> runWithOverlapGuard(taskId, triggerType));
        } catch (Exception e) {
            log.error("[task:{}] submit execution failed: {}", taskId, e.getMessage());
        }
    }

    private void runWithOverlapGuard(Long taskId, TriggerType triggerType) {
        AtomicBoolean flag = runningFlags.computeIfAbsent(taskId, k -> new AtomicBoolean(false));
        if (!flag.compareAndSet(false, true)) {
            log.info("[task:{}] execution skipped (previous run still in progress)", taskId);
            recordSkipped(taskId, triggerType);
            return;
        }
        try {
            executeWithRetry(taskId, triggerType);
        } finally {
            flag.set(false);
        }
    }

    private void executeWithRetry(Long taskId, TriggerType triggerType) {
        ScheduledTask task = taskRepository.findById(taskId).orElse(null);
        if (task == null) {
            log.warn("[task:{}] task not found at execution time (deleted?)", taskId);
            return;
        }
        if (triggerType == TriggerType.SCHEDULED && task.getStatus() != TaskStatus.ENABLED) {
            log.info("[task:{}] scheduled trigger dropped, task status={}", taskId, task.getStatus());
            return;
        }
        if (triggerType == TriggerType.SCHEDULED) {
            LocalDateTime now = LocalDateTime.now();
            if (task.getValidFrom() != null && now.isBefore(task.getValidFrom())) {
                log.info("[task:{}] scheduled trigger dropped, before validFrom={}", taskId, task.getValidFrom());
                return;
            }
            if (task.getValidUntil() != null && now.isAfter(task.getValidUntil())) {
                log.info("[task:{}] auto-pausing expired task (validUntil={})", taskId, task.getValidUntil());
                task.setStatus(TaskStatus.PAUSED);
                try {
                    taskRepository.save(task);
                } catch (Exception e) {
                    log.error("[task:{}] auto-pause persist FAILED: {}", taskId, e.getMessage());
                }
                return;
            }
        }

        LocalDateTime triggeredAt = LocalDateTime.now();
        LocalDateTime startedAt = LocalDateTime.now();
        int maxAttempts = 1 + (task.getRetryCount() == null ? 0 : task.getRetryCount());
        ExecutionResult result = null;
        int attempts = 0;
        for (int i = 0; i < maxAttempts; i++) {
            attempts = i;
            result = dispatch(task);
            if (result.status() == ExecutionStatus.SUCCESS) {
                break;
            }
            if (i < maxAttempts - 1) {
                long intervalSeconds = task.getRetryInterval() == null ? 60 : task.getRetryInterval();
                log.info("[task:{}] attempt {} failed ({}), retrying in {}s",
                        taskId, i + 1, result.status(), intervalSeconds);
                try {
                    Thread.sleep(Duration.ofSeconds(intervalSeconds).toMillis());
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    log.warn("[task:{}] retry sleep interrupted", taskId);
                    break;
                }
            }
        }
        LocalDateTime finishedAt = LocalDateTime.now();

        TaskExecution execution = TaskExecution.builder()
                .taskId(taskId)
                .triggerType(triggerType)
                .triggeredAt(triggeredAt)
                .startedAt(startedAt)
                .finishedAt(finishedAt)
                .durationMs((int) java.time.Duration.between(startedAt, finishedAt).toMillis())
                .status(result.status())
                .retryCount(attempts)
                .requestSummary(result.requestSummary())
                .responseSummary(result.responseSummary())
                .errorMessage(result.errorMessage())
                .build();
        try {
            executionRepository.save(execution);
        } catch (Exception e) {
            log.error("[task:{}] execution record persist FAILED: {}", taskId, e.getMessage());
        }
        // 失败原因必须落日志：否则排查时只能看到 status=FAILED 而无从下手
        log.info("[task:{}] execution finished status={} attempts={} durationMs={}{}",
                taskId, result.status(), attempts, execution.getDurationMs(),
                result.errorMessage() == null || result.errorMessage().isBlank()
                        ? "" : " error=" + result.errorMessage());

        try {
            notificationService.onExecutionFinished(task, execution);
        } catch (Exception e) {
            log.warn("[task:{}] notification dispatch failed: {}", taskId, e.getMessage());
        }
    }

    private ExecutionResult dispatch(ScheduledTask task) {
        if (executors.isEmpty()) {
            return ExecutionResult.of(ExecutionStatus.FAILED, null, null,
                    "无可用执行器（脚本执行器尚未注册）");
        }
        TaskExecutor executorImpl = executors.get(0);
        return executorImpl.execute(task);
    }

    private void recordSkipped(Long taskId, TriggerType triggerType) {
        try {
            executionRepository.save(TaskExecution.builder()
                    .taskId(taskId)
                    .triggerType(triggerType)
                    .triggeredAt(LocalDateTime.now())
                    .startedAt(null)
                    .finishedAt(null)
                    .durationMs(null)
                    .status(ExecutionStatus.SKIPPED)
                    .retryCount(0)
                    .build());
        } catch (Exception e) {
            log.error("[task:{}] skipped record persist FAILED: {}", taskId, e.getMessage());
        }
    }
}
