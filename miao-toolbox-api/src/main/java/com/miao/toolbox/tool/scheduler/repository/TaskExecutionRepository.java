package com.miao.toolbox.tool.scheduler.repository;

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

    /**
     * JPA 层按任务删除执行记录（删除任务时调用，与 DB 外键 CASCADE 双保险——
     * 测试库由 ddl-auto 建表无 FK，此方法是删除路径的唯一保障；调用方需在事务内）。
     * bulk DELETE 避免逐条 N+1。
     */
    @Modifying
    @Query("DELETE FROM TaskExecution e WHERE e.taskId = :taskId")
    long deleteByTaskId(@Param("taskId") Long taskId);

    /** 留存清理：删除指定时间之前的执行记录（FR-8，CleanExecutionLogsHandler 使用）。bulk DELETE。 */
    @Modifying
    @Query("DELETE FROM TaskExecution e WHERE e.triggeredAt < :before")
    long deleteByTriggeredAtBefore(@Param("before") LocalDateTime before);

    /** 批量取每任务最新一条执行记录（FR-1 列表的"上次执行状态"，id 自增即时间序，避免 N+1） */
    @Query("""
            SELECT e FROM TaskExecution e
            WHERE e.taskId IN :taskIds
              AND e.id IN (SELECT MAX(e2.id) FROM TaskExecution e2
                           WHERE e2.taskId IN :taskIds GROUP BY e2.taskId)
            """)
    List<TaskExecution> findLatestByTaskIds(@Param("taskIds") List<Long> taskIds);
}
