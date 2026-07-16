package com.miao.toolbox.tool.regex.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 正则 AI 请求 DTO。
 *
 * <p>三种 task 类型：
 * <ul>
 *   <li>generate — 自然语言描述 → 生成正则</li>
 *   <li>explain  — 正则 → 逐段解释</li>
 *   <li>optimize — 正则 → 优化建议</li>
 * </ul>
 */
@Data
public class RegexAIRequest {

    /** 任务类型：generate / explain / optimize */
    @NotBlank(message = "task 不能为空")
    @Pattern(regexp = "generate|explain|optimize", message = "task 必须为 generate/explain/optimize")
    private String task;

    /** 自然语言描述（task=generate 时必填） */
    @Size(max = 2000, message = "description 最长 2000 字符")
    private String description;

    /** 正则表达式（task=explain/optimize 时必填） */
    @Size(max = 1000, message = "pattern 最长 1000 字符")
    private String pattern;

    /** 当前标志位（可选，用于上下文） */
    @Size(max = 10, message = "flags 最长 10 字符")
    private String flags;

    /** 当前引擎（可选，用于上下文） */
    @Size(max = 10, message = "engine 最长 10 字符")
    private String engine;
}
