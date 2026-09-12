package com.miao.toolbox.tool.scheduler.job;

import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 执行记录留存清理（FR-9 / Story 3.4）——系统内置，无需超级管理员手工配置。
 *
 * <p>两条规则取「先触发」：
 * <ol>
 *   <li>按时间：超过 {@code scheduler.execution.retention-days}（默认 30）天的记录删除；</li>
 *   <li>按条数：每个任务只保留最近 {@code scheduler.execution.keep-per-task}（默认 100）条，
 *       超出部分删除（id 自增即时间序）。</li>
 * </ol>
 *
 * <p>为什么按条数这条必须存在：高频任务（如每分钟）30 天内可产生数万条记录，
 * 只按时间清理仍会让表无限膨胀。
 *
 * <p><b>失败隔离</b>：清理失败仅记日志，不向上传播——留存清理是旁路维护动作，
 * 任何异常都不应影响调度与执行主流程。
 *
 * <p><b>事务</b>：每条 {@code @Modifying} 删除由 Spring Data 各自包事务，
 * 因此重试/失败不会累积在一个大事务里；本方法刻意不加 {@code @Transactional}，
 * 否则 catch 后提交会触发 UnexpectedRollbackException。
 */
@Slf4j
@Component
public class ExecutionRetentionJob {

    private final TaskExecutionRepository executionRepository;

    @Value("${scheduler.execution.retention-days:30}")
    private int retentionDays;

    @Value("${scheduler.execution.keep-per-task:100}")
    private int keepPerTask;

    public ExecutionRetentionJob(TaskExecutionRepository executionRepository) {
        this.executionRepository = executionRepository;
    }

    /** 每晚执行一次（默认 03:30，与 OrphanFileCleanupJob 的 03:00 错开） */
    @Scheduled(cron = "${scheduler.execution.retention-cron:0 30 3 * * *}")
    public void cleanup() {
        try {
            long deletedByAge = executionRepository.deleteByTriggeredAtBefore(
                    LocalDateTime.now().minusDays(Math.max(retentionDays, 1)));

            long deletedByCount = 0;
            for (Long taskId : executionRepository.findDistinctTaskIds()) {
                deletedByCount += trimToKeep(taskId, Math.max(keepPerTask, 1));
            }

            log.info("[scheduler-retention] 清理完成 retentionDays={} keepPerTask={} deletedByAge={} deletedByCount={}",
                    retentionDays, keepPerTask, deletedByAge, deletedByCount);
        } catch (Exception e) {
            log.error("[scheduler-retention] 清理失败（不影响主流程）: {}", e.getMessage(), e);
        }
    }

    /**
     * 删除某任务超出保留条数的记录。
     *
     * @return 删除条数
     */
    private long trimToKeep(Long taskId, int keep) {
        // 第 keep-1 页（0 基）首项 = 第 keep 新的记录，即保留边界；
        // 无内容说明记录数不足 keep，无需清理
        Page<Long> boundary = executionRepository.findIdsByTaskIdDesc(taskId, PageRequest.of(keep - 1, 1));
        if (boundary.getContent().isEmpty()) {
            return 0;
        }
        // 删除严格早于边界的记录，正好保留最新 keep 条
        return executionRepository.deleteByTaskIdAndIdBefore(taskId, boundary.getContent().get(0));
    }
}
