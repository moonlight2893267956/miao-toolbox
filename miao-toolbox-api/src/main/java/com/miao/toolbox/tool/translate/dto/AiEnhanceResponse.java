package com.miao.toolbox.tool.translate.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * AI 增强翻译响应（对齐 translate-agent 的 output 字段）。
 */
@Data
public class AiEnhanceResponse {

    /** 实际执行的任务 */
    private String task;

    /** 最终增强译文 */
    private String translated;

    /** 百度原始直译（translate + baidu 模式返回） */
    private String mtDraft;

    /** 双语对照 [{src, tgt}]，便于前端双栏 */
    private List<Map<String, String>> bilingual;

    /** 润色/降级说明 */
    private String notes;
}
