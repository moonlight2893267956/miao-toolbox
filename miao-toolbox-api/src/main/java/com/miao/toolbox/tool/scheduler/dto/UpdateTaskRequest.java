package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 编辑定时任务请求（FR-1）。
 *
 * <p>敏感 header 约定：value 为空串或 {@code "****"} 时保留原密文（不回显明文的回写保护），
 * 非空非占位值时加密覆盖。targetType 创建后允许修改（v1 一个任务一个目标，整体替换）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateTaskRequest {

    @NotBlank(message = "任务名称不能为空")
    @Size(min = 2, max = 50, message = "任务名称长度须为 2-50 字")
    private String name;

    @Size(max = 200, message = "描述最长 200 字")
    private String description;

    @NotNull(message = "目标类型不能为空")
    private TargetType targetType;

    @NotNull(message = "目标配置不能为空")
    private TaskTargetConfig targetConfig;

    @NotBlank(message = "cron 表达式不能为空")
    @Size(max = 120, message = "cron 表达式最长 120 字符")
    private String cronExpression;

    private String timezone;

    private LocalDateTime validFrom;

    private LocalDateTime validUntil;

    private Integer retryCount;

    private Integer retryInterval;

    private Integer timeoutSeconds;

    private NotifyConfig notifyConfig;
}
