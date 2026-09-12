package com.miao.toolbox.tool.scheduler.repository;

import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TaskExecutionRepository extends JpaRepository<TaskExecution, Long> {

    /** 执行历史分页（FR-9：按触发时间倒序，走 (task_id, triggered_at DESC) 复合索引） */
    Page<TaskExecution> findByTaskIdOrderByTriggeredAtDesc(Long taskId, Pageable pageable);

    /** 执行历史分页 + 状态筛选（FR-9：status ∈ SUCCESS/FAILED/TIMEOUT/SKIPPED） */
    Page<TaskExecution> findByTaskIdAndStatusOrderByTriggeredAtDesc(Long taskId, ExecutionStatus status,
                                                                   Pageable pageable);

    /**
     * JPA 层按任务删除执行记录（删除任务时调用，与 DB 外键 CASCADE 双保险——
     * 测试库由 ddl-auto 建表无 FK，此方法是删除路径的唯一保障；调用方需在事务内）。
     * bulk DELETE 避免逐条 N+1。
     */
    @Modifying
    @Query("DELETE FROM TaskExecution e WHERE e.taskId = :taskId")
    long deleteByTaskId(@Param("taskId") Long taskId);

    /** 留存清理：删除指定时间之前的执行记录（FR-9，ExecutionRetentionJob 使用）。bulk DELETE。 */
    @Modifying
    @Query("DELETE FROM TaskExecution e WHERE e.triggeredAt < :before")
    long deleteByTriggeredAtBefore(@Param("before") LocalDateTime before);

    /** 留存清理：有执行记录的任务 ID 列表（用于逐任务裁剪保留条数） */
    @Query("SELECT DISTINCT e.taskId FROM TaskExecution e")
    List<Long> findDistinctTaskIds();

    /**
     * 留存清理：任务的执行记录 ID（按 id 倒序分页）。
     *
     * <p>调用方取第 {@code keep-1} 页（0 基）首项 = 「第 keep 新的记录」的 id，
     * 即保留边界；删除严格早于它的记录后正好留下 keep 条。
     * id 自增即时间序，无需再按 triggered_at 排序。
     */
    @Query("SELECT e.id FROM TaskExecution e WHERE e.taskId = :taskId ORDER BY e.id DESC")
    Page<Long> findIdsByTaskIdDesc(@Param("taskId") Long taskId, Pageable pageable);

    /** 留存清理：删除某任务中早于指定 id 的记录（即超出保留条数的部分）。bulk DELETE。 */
    @Modifying
    long deleteByTaskIdAndIdBefore(Long taskId, Long id);

    /** 批量取每任务最新一条执行记录（FR-1 列表的"上次执行状态"，id 自增即时间序，避免 N+1） */
    @Query("""
            SELECT e FROM TaskExecution e
            WHERE e.taskId IN :taskIds
              AND e.id IN (SELECT MAX(e2.id) FROM TaskExecution e2
                           WHERE e2.taskId IN :taskIds GROUP BY e2.taskId)
            """)
    List<TaskExecution> findLatestByTaskIds(@Param("taskIds") List<Long> taskIds);
}
