package com.miao.toolbox.tool.translate.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 语种识别响应（对齐前端 {@code DetectResponse} 契约）。
 */
@Data
@Builder
public class DetectResponse {

    /** 识别到的语种集合（含置信度） */
    private List<DetectResultItem> results;

    /** 字符占比最大的主语种（FR-6） */
    private String dominant;

    /** 推荐目标语言（FR-7 映射规则） */
    private String recommendedTarget;

    /** 单段识别结果 */
    @Data
    @Builder
    public static class DetectResultItem {
        /** 语种（百度码） */
        private String language;
        /** 置信度 0~1 */
        private double confidence;
    }
}
