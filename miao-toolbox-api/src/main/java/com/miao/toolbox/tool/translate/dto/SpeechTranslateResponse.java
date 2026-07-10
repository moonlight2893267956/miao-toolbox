package com.miao.toolbox.tool.translate.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 语音翻译响应（FR-12 后端，story-3.1）。
 *
 * <p>{@code sourceText} 为百度语音识别原文，{@code translatedText} 为译文。
 * 百度响应的 {@code target_tts}（译文合成语音）属"朗读"能力，按 FR-12 决策延后至 P2，本响应不返回。
 */
@Data
@Builder
public class SpeechTranslateResponse {

    /** 实际检测到的源语言（来自百度） */
    private String from;

    /** 目标语言 */
    private String to;

    /** 语音识别原文 */
    private String sourceText;

    /** 译文文本 */
    private String translatedText;
}
