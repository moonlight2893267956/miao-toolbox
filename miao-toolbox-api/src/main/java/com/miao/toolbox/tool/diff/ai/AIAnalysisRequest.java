package com.miao.toolbox.tool.diff.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * AI 分析请求 DTO。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AIAnalysisRequest {

    /** 分析模式：summary（全局摘要）或 explain_selection（选中解释） */
    private String mode;

    /** 文件语言类型（如 java, json, yaml 等） */
    private String language;

    // --- summary 模式字段 ---

    /** 变更统计（summary 模式） */
    private DiffStatisticsDto statistics;

    /** 差异块列表（summary 模式） */
    private List<Map<String, Object>> hunks;

    // --- explain_selection 模式字段 ---

    /** 选中的差异块（explain_selection 模式） */
    private List<Map<String, Object>> selectedHunks;

    /** 选中内容前文上下文（可选） */
    private String contextBefore;

    /** 选中内容后文上下文（可选） */
    private String contextAfter;

    /**
     * 变更统计内部 DTO
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DiffStatisticsDto {
        private int additions;
        private int deletions;
        private int modifications;
    }
}
