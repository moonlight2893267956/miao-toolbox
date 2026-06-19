package com.miao.toolbox.tool.diff;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class FormatRequest {

    /** 待格式化文本 */
    @NotBlank(message = "待格式化文本不能为空")
    private String text;

    /** 目标语言: java | json | yaml | sql | xml | html | css */
    @NotBlank(message = "目标语言不能为空")
    @Pattern(regexp = "java|json|yaml|sql|xml|html|css", message = "不支持的格式化语言")
    private String language;
}
