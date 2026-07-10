package com.miao.toolbox.tool.translate.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 图片翻译响应（对齐前端图片翻译契约，覆盖 FR-8，并预留 FR-9/FR-10 字段）。
 *
 * <p>{@code renderedImage} 来自百度译文渲染图（pasteImg），供 story-2.3 预览；
 * {@code sourceText}/{@code translatedText} 来自百度整图全文（sumSrc/sumDst），供 story-2.4 复制/导出。
 */
@Data
@Builder
public class ImageTranslateResponse {

    /** 实际检测到的源语言（来自百度） */
    private String from;

    /** 目标语言 */
    private String to;

    /** OCR 文本块与逐块译文（FR-8 核心） */
    private List<ImageTextBlock> blocks;

    /** 整图原文汇总（sumSrc） */
    private String sourceText;

    /** 整图译文汇总（sumDst） */
    private String translatedText;

    /** 译文渲染图（data URL，百度 pasteImg 补全前缀），供 FR-9 预览 */
    private String renderedImage;

    /** 单块 OCR 文本 + 逐块译文 */
    @Data
    @Builder
    public static class ImageTextBlock {
        /** 原文本 */
        private String src;
        /** 译文 */
        private String dst;
        /** 文本区域像素坐标（百度 rect，原样透传） */
        private String rect;
        /** 文本多边形顶点（百度 points，可选） */
        private List<Point> points;
        /** 该块贴合渲染图（data URL，可选） */
        private String blockImage;
    }

    /** 文本块顶点 */
    @Data
    @Builder
    public static class Point {
        private int x;
        private int y;
    }
}
