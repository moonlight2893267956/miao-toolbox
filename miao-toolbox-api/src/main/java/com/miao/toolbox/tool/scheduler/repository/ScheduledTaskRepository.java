package com.miao.toolbox.tool.scheduler.repository;

import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScheduledTaskRepository extends JpaRepository<ScheduledTask, Long> {

    /** 任务名称唯一性校验（FR-1：名称重复返回 SCHEDULER_TASK_NAME_DUPLICATED） */
    boolean existsByName(String name);

    /** 重启恢复：加载全部启用状态任务（NFR-2，SchedulerRecoveryRunner 使用） */
    List<ScheduledTask> findByStatus(TaskStatus status);
}
