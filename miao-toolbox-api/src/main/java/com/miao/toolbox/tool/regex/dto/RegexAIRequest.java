package com.miao.toolbox.tool.regex.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 正则 AI 请求 DTO。
 *
 * <p>五种 task 类型：
 * <ul>
 *   <li>generate — 自然语言描述 → 生成正则</li>
 *   <li>explain  — 正则 → 逐段解释</li>
 *   <li>optimize — 正则 → 优化建议（suggestions 内嵌优化后表达式）</li>
 *   <li>diagnose — 正则 + 样例 → 匹配诊断与修正表达式</li>
 *   <li>convert  — 正则 → 指定引擎方言转换</li>
 * </ul>
 */
@Data
public class RegexAIRequest {

    /** 任务类型：generate / explain / optimize / diagnose / convert */
    @NotBlank(message = "task 不能为空")
    @Pattern(regexp = "generate|explain|optimize|diagnose|convert",
            message = "task 必须为 generate/explain/optimize/diagnose/convert")
    private String task;

    /** 自然语言描述（task=generate 时必填） */
    @Size(max = 2000, message = "description 最长 2000 字符")
    private String description;

    /** 正则表达式（task=explain/optimize/diagnose/convert 时必填） */
    @Size(max = 1000, message = "pattern 最长 1000 字符")
    private String pattern;

    /** 当前标志位（可选，用于上下文） */
    @Size(max = 10, message = "flags 最长 10 字符")
    private String flags;

    /** 当前引擎（可选，用于上下文，如 js/pcre/python/java/go/rust） */
    @Size(max = 10, message = "engine 最长 10 字符")
    private String engine;

    /** 目标引擎（task=convert 时必填） */
    @Size(max = 10, message = "targetEngine 最长 10 字符")
    private String targetEngine;

    /** 样例文本（task=diagnose 时用于诊断匹配/不匹配的文本） */
    @Size(max = 20, message = "samples 最多 20 条")
    private List<String> samples;

    /** 多轮对话历史（可选，用于 diagnose 追问） */
    @Size(max = 20, message = "conversation 最多 20 轮")
    private List<ConversationTurn> conversation;

    /** 对话轮次 */
    @Data
    public static class ConversationTurn {
        /** 角色：user / assistant */
        @NotBlank(message = "conversation.role 不能为空")
        private String role;
        /** 内容 */
        @NotBlank(message = "conversation.content 不能为空")
        private String content;
    }
}
