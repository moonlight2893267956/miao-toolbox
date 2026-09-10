package com.miao.toolbox.tool.scheduler.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * cron 表达式校验响应（FR-2）——valid=false 时仅 error 有值。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ValidateCronResponse {

    /** 表达式是否有效 */
    private boolean valid;

    /** 规范化后的 6 位表达式（valid=true 时返回；5 位方言前补秒 0） */
    private String normalizedExpression;

    /** 下次 5 次执行时间（基于时区） */
    private List<LocalDateTime> nextRuns;

    /** 无效时的中文错误描述 */
    private String error;
}
