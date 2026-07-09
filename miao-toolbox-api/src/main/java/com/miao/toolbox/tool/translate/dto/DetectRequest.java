package com.miao.toolbox.tool.translate.dto;

import jakarta.validation.constraints.NotBlank;

import lombok.Data;

/**
 * 语种识别请求（对齐前端 {@code DetectRequest} 契约）。
 */
@Data
public class DetectRequest {

    /** 待识别文本 */
    @NotBlank(message = "待识别文本不能为空")
    private String text;
}
