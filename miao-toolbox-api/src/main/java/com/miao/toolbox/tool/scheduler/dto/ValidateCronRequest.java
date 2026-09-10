package com.miao.toolbox.tool.scheduler.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * cron 表达式校验请求（FR-2）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ValidateCronRequest {

    /** cron 表达式（5 位 Unix 方言或 6 位） */
    @NotBlank(message = "cron 表达式不能为空")
    private String expression;

    /** 时区（可空，默认 Asia/Shanghai） */
    private String timezone;
}
