package com.miao.toolbox.tool.regex.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 正则 AI 响应 DTO。
 */
@Data
@Builder
public class RegexAIResponse {

    /** 任务类型 */
    private String task;

    /** AI 生成/优化后的正则表达式 */
    private String pattern;

    /** AI 解释/说明文本 */
    private String explanation;

    /** 优化建议列表（task=optimize 时有值） */
    private java.util.List<String> suggestions;

    /** 使用的模型 */
    private String model;

    /** 追踪 ID */
    private String traceId;
}
