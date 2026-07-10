package com.miao.toolbox.tool.translate;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.proxy.client.BaiduTranslateClient;
import com.miao.toolbox.tool.translate.dto.DetectRequest;
import com.miao.toolbox.tool.translate.dto.DetectResponse;
import com.miao.toolbox.tool.translate.dto.ImageTranslateResponse;
import com.miao.toolbox.tool.translate.dto.SpeechTranslateRequest;
import com.miao.toolbox.tool.translate.dto.SpeechTranslateResponse;
import com.miao.toolbox.tool.translate.dto.TranslateRequest;
import com.miao.toolbox.tool.translate.dto.TranslateResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 翻译业务编排层。
 *
 * <p>将前端请求委托给 {@link BaiduTranslateClient}，映射为前端契约 DTO。
 * 推荐目标语言（FR-7）按简单规则推导：源为中文 → 推荐英语；否则 → 推荐中文。
 * AI 润色/上下文连贯（FR-16/17）将在后续 Epic 4 接入 miao-agent 时扩展。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TranslateService {

    /** 图片大小上限（百度图片翻译 ≤ 4MB） */
    private static final long MAX_IMAGE_BYTES = 4L * 1024 * 1024;

    /** 语音翻译最大音频大小（≤60s@16k/16bit/单声道 ≈ 1.92MB，取 2MB 上限） */
    private static final long MAX_VOICE_BYTES = 2L * 1024 * 1024;

    /** 百度语音翻译支持的音频格式白名单（webm/opus 不在列，转码归 story-3.2） */
    private static final Set<String> SUPPORTED_VOICE_FORMATS = Set.of("pcm", "wav", "amr", "m4a");

    private final BaiduTranslateClient baiduTranslateClient;

    /**
     * 文本翻译。
     */
    public TranslateResponse translate(TranslateRequest request) {
        String from = (request.getFrom() == null || request.getFrom().isBlank()) ? "auto" : request.getFrom();
        String to = request.getTo();
        if (to == null || to.isBlank()) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "目标语言不能为空", 400);
        }

        BaiduTranslateClient.TranslateResult result =
                baiduTranslateClient.translate(request.getText(), from, to);

        String translated = result.items().stream()
                .map(BaiduTranslateClient.TranslateItem::dst)
                .collect(Collectors.joining("\n"));

        return TranslateResponse.builder()
                .translatedText(translated)
                .from(result.from())
                .charCount(request.getText() == null ? 0 : request.getText().length())
                .build();
    }

    /**
     * 语种识别（FR-5/6/7）。
     */
    public DetectResponse detect(DetectRequest request) {
        String text = request.getText();
        if (text == null || text.isBlank()) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "待识别文本不能为空", 400);
        }

        BaiduTranslateClient.DetectResult result = baiduTranslateClient.detectLanguage(text);

        List<DetectResponse.DetectResultItem> items = result.languages().stream()
                .map(l -> DetectResponse.DetectResultItem.builder()
                        .language(l.language())
                        .confidence(l.confidence())
                        .build())
                .collect(Collectors.toList());

        return DetectResponse.builder()
                .results(items)
                .dominant(result.language())
                .recommendedTarget(recommendTarget(result.language()))
                .build();
    }

    /**
     * FR-7 推荐目标语言规则：中文源 → 英语；其他源 → 中文；未知 → null。
     */
    private String recommendTarget(String dominant) {
        if (dominant == null || dominant.isBlank()) {
            return null;
        }
        if ("zh".equals(dominant)) {
            return "en";
        }
        return "zh";
    }

    /**
     * 图片翻译（FR-8）。
     *
     * <p>校验图片非空、目标语言非空、大小 ≤ 4MB，委托 {@link BaiduTranslateClient#imageTranslate}，
     * 映射为前端契约 DTO（含整图全文与渲染图，供后续 FR-9/FR-10 复用）。
     */
    public ImageTranslateResponse imageTranslate(MultipartFile image, String from, String to) {
        if (image == null || image.isEmpty()) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "图片不能为空", 400);
        }
        if (to == null || to.isBlank()) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "目标语言不能为空", 400);
        }
        if (image.getSize() > MAX_IMAGE_BYTES) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "图片大小不能超过 4MB", 400);
        }
        String fromLang = (from == null || from.isBlank()) ? "auto" : from;
        try {
            BaiduTranslateClient.ImageTranslateResult result =
                    baiduTranslateClient.imageTranslate(image.getBytes(), fromLang, to);
            List<ImageTranslateResponse.ImageTextBlock> blocks = result.blocks().stream()
                    .map(b -> ImageTranslateResponse.ImageTextBlock.builder()
                            .src(b.src())
                            .dst(b.dst())
                            .rect(b.rect())
                            .points(b.points().stream()
                                    .map(p -> ImageTranslateResponse.Point.builder()
                                            .x(p.x())
                                            .y(p.y())
                                            .build())
                                    .collect(Collectors.toList()))
                            .blockImage(b.blockImage())
                            .build())
                    .collect(Collectors.toList());
            return ImageTranslateResponse.builder()
                    .from(result.from())
                    .to(result.to())
                    .blocks(blocks)
                    .sourceText(result.sumSrc())
                    .translatedText(result.sumDst())
                    .renderedImage(result.pasteImg())
                    .build();
        } catch (IOException e) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "读取图片失败", 400);
        }
    }

    /**
     * 语音翻译（FR-12 后端，story-3.1）。
     *
     * <p>校验录音非空、目标语言非空、大小 ≤ 2MB、格式白名单（pcm/wav/amr/m4a），
     * 委托 {@link BaiduTranslateClient#speechTranslate}，映射为前端契约 {@link SpeechTranslateResponse}。
     * {@code from} 缺省时回传请求值（{@code auto}）；百度未在响应中单独返回源语言。
     */
    public SpeechTranslateResponse speechTranslate(SpeechTranslateRequest request) {
        MultipartFile voice = request.getVoice();
        if (voice == null || voice.isEmpty()) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "录音音频不能为空", 400);
        }
        String to = request.getTo();
        if (to == null || to.isBlank()) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "目标语言不能为空", 400);
        }
        if (voice.getSize() > MAX_VOICE_BYTES) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "录音文件过大（上限 2MB）", 400);
        }
        String format = resolveVoiceFormat(request.getFormat(), voice.getOriginalFilename());
        if (!SUPPORTED_VOICE_FORMATS.contains(format)) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST",
                    "百度语音翻译仅支持 pcm/wav/amr/m4a 格式", 400);
        }
        String from = request.getFrom();
        try {
            BaiduTranslateClient.SpeechTranslateResult result =
                    baiduTranslateClient.speechTranslate(voice.getBytes(), format, from, to);
            return SpeechTranslateResponse.builder()
                    .from(from)
                    .to(to)
                    .sourceText(result.source())
                    .translatedText(result.target())
                    .build();
        } catch (IOException e) {
            throw new BusinessException("TRANSLATE_INVALID_REQUEST", "读取录音文件失败", 400);
        }
    }

    /**
     * 解析音频格式：优先用显式 {@code format}；缺省时从文件名扩展名推断；
     * 仍推断不出默认 {@code wav}。
     */
    private String resolveVoiceFormat(String format, String filename) {
        if (format != null && !format.isBlank()) {
            return format.trim().toLowerCase();
        }
        if (filename != null && filename.contains(".")) {
            String ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
            if (!ext.isBlank()) {
                return ext;
            }
        }
        return "wav";
    }
}
