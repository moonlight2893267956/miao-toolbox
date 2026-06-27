package com.miao.toolbox.tool.diff.ai;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * AI 分析响应 DTO。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AIAnalysisResponse {

    /** 分析模式 */
    private String mode;

    /** 分析结果（结构化 JSON 或纯文本） */
    private Object analysis;

    /** 使用的 LLM 模型名称 */
    private String model;

    /** Langfuse trace ID（用于跳转可观测性面板） */
    private String traceId;

    /** 错误信息（失败时返回） */
    private String error;
}
