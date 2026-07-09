package com.miao.toolbox.tool.translate;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.proxy.client.BaiduTranslateClient;
import com.miao.toolbox.tool.translate.dto.DetectRequest;
import com.miao.toolbox.tool.translate.dto.DetectResponse;
import com.miao.toolbox.tool.translate.dto.TranslateRequest;
import com.miao.toolbox.tool.translate.dto.TranslateResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
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
}
