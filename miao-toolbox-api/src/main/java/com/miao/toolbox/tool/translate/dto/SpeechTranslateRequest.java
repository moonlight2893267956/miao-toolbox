package com.miao.toolbox.tool.translate.dto;

import org.springframework.web.multipart.MultipartFile;

/**
 * 语音翻译请求（FR-12 后端，story-3.1）。
 *
 * <p>以 {@code multipart/form-data} 上传录音音频，由服务端代理调用百度语音翻译 API。
 * 音频格式需为百度支持的 {@code pcm / wav / amr / m4a}（webm/opus 不支持，转码归 story-3.2）。
 */
public class SpeechTranslateRequest {

    /** 录音音频文件（二进制） */
    private MultipartFile voice;

    /** 源语言（百度码，{@code auto} 由百度识别），默认 auto */
    private String from = "auto";

    /** 目标语言（百度码，必填） */
    private String to;

    /**
     * 音频格式（{@code pcm/wav/amr/m4a}），可选。
     * 缺省时由服务端从文件名扩展名推断，推断不出默认 {@code wav}。
     */
    private String format;

    public MultipartFile getVoice() {
        return voice;
    }

    public void setVoice(MultipartFile voice) {
        this.voice = voice;
    }

    public String getFrom() {
        return from;
    }

    public void setFrom(String from) {
        this.from = (from == null || from.isBlank()) ? "auto" : from;
    }

    public String getTo() {
        return to;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public String getFormat() {
        return format;
    }

    public void setFormat(String format) {
        this.format = format;
    }
}
