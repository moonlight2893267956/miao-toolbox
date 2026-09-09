package com.miao.toolbox.tool.scheduler.repository;

import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScheduledTaskRepository extends JpaRepository<ScheduledTask, Long> {

    /** 任务名称唯一性校验（FR-1：名称重复返回 SCHEDULER_TASK_NAME_DUPLICATED） */
    boolean existsByName(String name);

    /** 重启恢复：加载全部启用状态任务（NFR-2，SchedulerRecoveryRunner 使用） */
    List<ScheduledTask> findByStatus(TaskStatus status);

    /** 列表：按名称搜索（FR-1，大小写不敏感） */
    Page<ScheduledTask> findByNameContainingIgnoreCase(String name, Pageable pageable);

    /** 列表：按状态筛选（FR-1） */
    Page<ScheduledTask> findByStatus(TaskStatus status, Pageable pageable);

    /** 列表：名称搜索 + 状态筛选组合（FR-1） */
    Page<ScheduledTask> findByNameContainingIgnoreCaseAndStatus(String name, TaskStatus status, Pageable pageable);
}
