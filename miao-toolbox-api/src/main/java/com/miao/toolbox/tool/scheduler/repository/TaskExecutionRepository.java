package com.miao.toolbox.tool.scheduler.repository;

import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;

@Repository
public interface TaskExecutionRepository extends JpaRepository<TaskExecution, Long> {

    /** 执行历史分页（FR-9：按触发时间倒序，走 (task_id, triggered_at DESC) 复合索引） */
    Page<TaskExecution> findByTaskIdOrderByTriggeredAtDesc(Long taskId, Pageable pageable);

    /**
     * JPA 层按任务删除执行记录（删除任务时调用，与 DB 外键 CASCADE 双保险——
     * 测试库由 ddl-auto 建表无 FK，此方法是删除路径的唯一保障；调用方需在事务内）。
     */
    long deleteByTaskId(Long taskId);

    /** 留存清理：删除指定时间之前的执行记录（FR-8，CleanExecutionLogsHandler 使用） */
    long deleteByTriggeredAtBefore(LocalDateTime before);
}
