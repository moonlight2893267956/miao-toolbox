package com.miao.toolbox.tool.translate.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 文本翻译响应（对齐前端 {@code TranslateResponse} 契约）。
 */
@Data
@Builder
public class TranslateResponse {

    /** 译文文本（多段落以换行拼接） */
    private String translatedText;

    /** 实际检测到的源语言（来自百度） */
    private String from;

    /** 字符消耗（用于后端审计，不驱动前端展示） */
    private int charCount;
}
