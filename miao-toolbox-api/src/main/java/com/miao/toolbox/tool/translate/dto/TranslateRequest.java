package com.miao.toolbox.tool.translate.dto;

import jakarta.validation.constraints.NotBlank;

import lombok.Data;

/**
 * 文本翻译请求（对齐前端 {@code TranslateRequest} 契约）。
 */
@Data
public class TranslateRequest {

    /** 待翻译文本 */
    @NotBlank(message = "翻译内容不能为空")
    private String text;

    /** 源语言；{@code auto} 由百度内部识别（FR-2） */
    private String from = "auto";

    /** 目标语言 */
    @NotBlank(message = "目标语言不能为空")
    private String to;
}
