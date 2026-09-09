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
 * 执行引擎（FR-4/FR-7/NFR-3/NFR-5）——任务触发 → skip 重叠 → 异步执行 → 重试 → 记录落库。
 *
 * <p>线程模型（NFR-3）：调度线程（poolSize=2）仅做 CAS 检查与任务提交，实际执行
 * 在独立执行线程池（max=10，NFR-6）——单任务执行不阻塞调度。
 *
 * <p>skip 重叠（FR-7）：runningFlags 按任务 CAS；到点触发时上一次尚未完成 →
 * 记一条 SKIPPED 执行记录。手动触发同样受重叠约束（同任务不并发）。
 *
 * <p>执行记录（FR-8）：执行完成后同步写入（不在异步通知中）；一次执行（含全部重试）
 * 对应一条记录，retry_count 记实际尝试次数。
 */
@Slf4j
@Service
public class ExecutionEngine {

    private final ScheduledTaskRepository taskRepository;
    private final TaskExecutionRepository executionRepository;
    private final List<TaskExecutor> executors;
    private final ThreadPoolTaskExecutor executor;

    /** taskId → 是否执行中（skip 重叠，单实例内存态，NFR-4） */
    private final Map<Long, AtomicBoolean> runningFlags = new ConcurrentHashMap<>();

    public ExecutionEngine(ScheduledTaskRepository taskRepository,
                           TaskExecutionRepository executionRepository,
                           List<TaskExecutor> executors,
                           @Qualifier("schedulerTaskExecutor") ThreadPoolTaskExecutor executor) {
        this.taskRepository = taskRepository;
        this.executionRepository = executionRepository;
        this.executors = executors;
        this.executor = executor;
    }

    /** cron 调度触发入口（SchedulerService.onCronTrigger 调用，运行在调度线程） */
    public void triggerScheduled(Long taskId) {
        submit(taskId, TriggerType.SCHEDULED);
    }

    /** 手动触发入口（ts-1-4 Controller 调用） */
    public void triggerManual(Long taskId) {
        submit(taskId, TriggerType.MANUAL);
    }

    /**
     * 提交执行：CAS 重叠检查（快）后异步提交到执行线程池。
     * 调度线程在此方法返回后立即空闲，不被执行拖住（NFR-3）。
     */
    private void submit(Long taskId, TriggerType triggerType) {
        try {
            executor.execute(() -> runWithOverlapGuard(taskId, triggerType));
        } catch (Exception e) {
            // 线程池已 shutdown 等极端场景：不影响调用方（调度线程）
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
        // 竞态防御：调度触发的瞬间任务被暂停/到期——SCHEDULED 且非 ENABLED 直接放弃
        if (triggerType == TriggerType.SCHEDULED && task.getStatus() != TaskStatus.ENABLED) {
            log.info("[task:{}] scheduled trigger dropped, task status={}", taskId, task.getStatus());
            return;
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
        log.info("[task:{}] execution finished status={} attempts={} durationMs={}",
                taskId, result.status(), attempts, execution.getDurationMs());
    }

    private ExecutionResult dispatch(ScheduledTask task) {
        TaskExecutor executorImpl = executors.stream()
                .filter(e -> e.supports() == task.getTargetType())
                .findFirst()
                .orElse(null);
        if (executorImpl == null) {
            return ExecutionResult.of(ExecutionStatus.FAILED, null, null,
                    "不支持的目标类型: " + task.getTargetType());
        }
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
