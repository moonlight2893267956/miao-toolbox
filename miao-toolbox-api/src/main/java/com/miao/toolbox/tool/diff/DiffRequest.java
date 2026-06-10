package com.miao.toolbox.tool.diff;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class DiffRequest {

    /** 左侧文本内容（与 leftFileKey 二选一） */
    private String left;

    /** 右侧文本内容（与 rightFileKey 二选一） */
    private String right;

    /** 左侧 COS 文件 Key（与 left 二选一） */
    private String leftFileKey;

    /** 右侧 COS 文件 Key（与 right 二选一） */
    private String rightFileKey;

    /** 对比粒度: char | word | line */
    @NotBlank(message = "对比粒度不能为空")
    @Pattern(regexp = "char|word|line", message = "不支持的对比粒度")
    private String granularity;

    /** 是否忽略空白符差异 */
    private boolean ignoreWhitespace = false;

    /** 是否启用结构化对比（JSON/YAML） */
    private boolean structuredDiff = false;

    /** 左侧标签 */
    private String leftLabel = "原文(A)";

    /** 右侧标签 */
    private String rightLabel = "对比(B)";
}
