package com.miao.toolbox.tool.cron.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Cron AI 响应 DTO。
 */
@Data
@Builder
public class CronAIResponse {

    /** 任务类型 */
    private String task;

    /** 生成 / 转换后的 Cron 表达式 */
    private String expression;

    /** 生成 / 转换后的方言（与目标一致） */
    private String dialect;

    /** 转换原文（回显） */
    private String originalExpression;

    /** 转换结果 */
    private String convertedExpression;

    /** 优化后的 Cron 表达式（task=optimize 时，Agent 可能用 optimizedExpression 字段名） */
    private String optimizedExpression;

    /** 解释文本（generate / explain） */
    private String explanation;

    /** 优化建议列表（task=optimize 时有值） */
    private List<String> suggestions;

    /** 诊断结果（task=diagnose） */
    private String diagnosis;

    /** 使用的模型 */
    private String model;

    /** 追踪 ID */
    private String traceId;
}
