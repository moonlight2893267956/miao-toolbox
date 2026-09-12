package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 任务列表项响应（FR-3）——精简字段，不含脚本内容。
 *
 * <p>V35 改造：移除 {@code targetType}，改为 {@code scriptName}/{@code scriptVersion}（展示用）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskListItemResponse {

    private Long id;

    private String name;

    /** 脚本名称（展示用） */
    private String scriptName;

    /** 脚本版本号 */
    private Integer scriptVersion;

    private String cronExpression;

    private TaskStatus status;

    /** 下次执行时间（ENABLED 时计算） */
    private LocalDateTime nextRunAt;

    /** 上次执行状态（无执行记录为 null） */
    private String lastExecutionStatus;

    private LocalDateTime createdAt;
}
