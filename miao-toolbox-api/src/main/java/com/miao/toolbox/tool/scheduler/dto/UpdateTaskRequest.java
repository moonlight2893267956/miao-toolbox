package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 编辑定时任务请求（FR-3）。
 *
 * <p>V35 改造：{@code targetType}/{@code targetConfig} 替换为 {@code scriptId}/{@code scriptVersion}/{@code params}。
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

    @NotNull(message = "脚本不能为空")
    private Long scriptId;

    @NotNull(message = "脚本版本不能为空")
    private Integer scriptVersion;

    /** 参数值（JSON 对象，按脚本 param schema 渲染；可空 = 无参数脚本） */
    private String params;

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
