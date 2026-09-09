package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 任务列表项响应（FR-1）——精简字段，不含目标配置详情。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskListItemResponse {

    private Long id;

    private String name;

    private TargetType targetType;

    private String cronExpression;

    private TaskStatus status;

    /** 下次执行时间（ENABLED 时计算） */
    private LocalDateTime nextRunAt;

    /** 上次执行状态（无执行记录为 null） */
    private String lastExecutionStatus;

    private LocalDateTime createdAt;
}
