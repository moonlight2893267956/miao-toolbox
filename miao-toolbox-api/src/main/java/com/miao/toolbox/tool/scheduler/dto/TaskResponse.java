package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 任务详情响应（FR-1/FR-9）。
 *
 * <p>{@code targetConfig} 中敏感 header 值已被 Service 层替换为 {@code ****} 占位
 * （不回显明文，也不返回密文）；{@code nextRunAt} 为 ENABLED 状态下按 cron + 时区计算的下次执行时间。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskResponse {

    private Long id;

    private String name;

    private String description;

    private TargetType targetType;

    /** 目标配置（敏感 header 值 = ****） */
    private TaskTargetConfig targetConfig;

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
