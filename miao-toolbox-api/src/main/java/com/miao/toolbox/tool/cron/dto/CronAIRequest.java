package com.miao.toolbox.tool.cron.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * Cron AI 请求 DTO。
 *
 * <p>五种 task 类型：
 * <ul>
 *   <li>generate — 自然语言描述 → 生成 Cron 表达式</li>
 *   <li>explain  — Cron 表达式 → 中文详解</li>
 *   <li>optimize  — Cron 表达式 → 优化建议</li>
 *   <li>diagnose — Cron 表达式 + 现象描述 → 排错诊断（支持多轮）</li>
 *   <li>convert  — Cron 表达式 → 方言转换</li>
 * </ul>
 */
@Data
public class CronAIRequest {

    /** 任务类型 */
    @NotBlank(message = "task 不能为空")
    @Pattern(regexp = "generate|explain|optimize|diagnose|convert",
            message = "task 必须为 generate/explain/optimize/diagnose/convert")
    private String task;

    /** 自然语言描述（task=generate 时必填） */
    @Size(max = 2000, message = "description 最长 2000 字符")
    private String description;

    /** 当前表达式（explain/optimize/diagnose/convert 时必填） */
    @Size(max = 200, message = "expression 最长 200 字符")
    private String expression;

    /** 方言：linux5（5 位）/ spring6（6 位），可选，缺省按字段数推断 */
    @Pattern(regexp = "linux5|spring6", message = "dialect 必须为 linux5 或 spring6")
    private String dialect;

    /** 目标方言（task=convert 时必填） */
    @Pattern(regexp = "linux5|spring6", message = "targetDialect 必须为 linux5 或 spring6")
    private String targetDialect;

    /** 现象描述（task=diagnose 时必填） */
    @Size(max = 2000, message = "phenomenon 最长 2000 字符")
    private String phenomenon;

    /** 多轮对话历史（task=diagnose 时可选） */
    private List<CronAIMessage> conversation;
}
