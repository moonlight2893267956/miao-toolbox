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
 * 创建定时任务请求（FR-1/FR-2/FR-3）。
 *
 * <p>{@code targetConfig} 为多态 JSON（targetType 判别），由 Jackson 反序列化为
 * {@link TaskTargetConfig}；敏感 header 值由 Service 层加密后持久化。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateTaskRequest {

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

    /** 时区（默认 Asia/Shanghai，由 Service 层补默认值后校验） */
    private String timezone;

    private LocalDateTime validFrom;

    private LocalDateTime validUntil;

    private Integer retryCount;

    private Integer retryInterval;

    private Integer timeoutSeconds;

    /** 通知配置（可空 = 不通知） */
    private NotifyConfig notifyConfig;
}
