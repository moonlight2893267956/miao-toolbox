package com.miao.toolbox.tool.regex.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 正则 AI 响应 DTO。
 */
@Data
@Builder
public class RegexAIResponse {

    /** 任务类型 */
    private String task;

    /** AI 生成/优化/诊断修正后的正则表达式 */
    private String pattern;

    /** 原文正则（task=optimize/convert/diagnose 时回显，用于对照展示） */
    private String originalPattern;

    /** 转换后的表达式（task=convert 时必填） */
    private String convertedPattern;

    /** 匹配诊断文本（task=diagnose 时必填） */
    private String diagnosis;

    /** 表达式对应的引擎（如 js/pcre/python/java/go/rust） */
    private String engine;

    /** AI 解释/说明文本 */
    private String explanation;

    /** 优化建议列表（task=optimize 时有值，每条内嵌 "{表达式} — {理由}"） */
    private List<String> suggestions;

    /** 流模式：sync / stream */
    private String mode;

    /** 使用的模型 */
    private String model;

    /** 追踪 ID */
    private String traceId;
}
