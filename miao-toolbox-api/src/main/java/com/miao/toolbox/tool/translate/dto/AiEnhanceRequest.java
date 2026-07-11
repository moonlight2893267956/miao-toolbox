package com.miao.toolbox.tool.translate.dto;

import jakarta.validation.constraints.NotBlank;

import lombok.Data;

/**
 * AI 增强翻译请求（FR-16/FR-17，story-4.1）。
 *
 * <p>百度调用权归 miao-ai 侧 translate-agent 自管，本请求仅传文本与风格指令，不传 mt_draft、不持有百度密钥。
 */
@Data
public class AiEnhanceRequest {

    /** 待增强文本（必填） */
    @NotBlank(message = "待增强文本不能为空")
    private String text;

    /** 源语言；{@code auto} 由 agent 内部识别，默认 auto */
    private String sourceLang = "auto";

    /** 目标语言，默认 en */
    private String targetLang = "en";

    /** 风格：formal/casual/business/marketing/academic，可空（agent 不强制） */
    private String tone;

    /** 任务：translate（默认，百度打底+润色）/ polish（风格化润色）/ context（上下文连贯） */
    private String task = "translate";

    /**
     * 前文上下文（FR-17，仅 task=context 时使用）。
     *
     * <p>由前端把本次翻译序列已完成的「原文→译文」对拼接而成，用于让 agent 保证全文
     * 术语一致、语气连贯、指代明确。可空（首轮无前文时为空）。
     */
    private String context;
}
