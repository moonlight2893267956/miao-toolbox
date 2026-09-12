package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 任务详情响应（FR-3/FR-10）。
 *
 * <p>V35 改造：移除 {@code targetType}/{@code targetConfig}，
 * 改为 {@code scriptId}/{@code scriptVersion}/{@code params} + {@code scriptName}/{@code scriptType}（展示用）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskResponse {

    private Long id;

    private String name;

    private String description;

    private Long scriptId;

    private Integer scriptVersion;

    /** 脚本名称（展示用，Service 层关联查询填充） */
    private String scriptName;

    /** 脚本类型（展示用） */
    private ScriptType scriptType;

    /** 参数值快照 JSON 文本 */
    private String params;

    private String cronExpression;

    private String timezone;

    private LocalDateTime validFrom;

    private LocalDateTime validUntil;

    private TaskStatus status;

    private Integer retryCount;

    private Integer retryInterval;

    private Integer timeoutSeconds;

    private NotifyConfig notifyConfig;

    /** 下次执行时间（ENABLED 时计算；PAUSED 为 null） */
    private LocalDateTime nextRunAt;

    /** 上次执行状态（无执行记录为 null） */
    private String lastExecutionStatus;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
