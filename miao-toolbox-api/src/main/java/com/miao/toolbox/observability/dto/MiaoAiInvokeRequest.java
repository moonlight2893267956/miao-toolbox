package com.miao.toolbox.observability.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * miao-ai invoke 请求 DTO（通用）。
 *
 * 与 AIAnalysisRequest 不同，这是 MiaoAiClient 的通用请求格式，
 * 不绑定任何特定业务场景。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MiaoAiInvokeRequest {

    /** Agent 名称（如 diff-explainer） */
    private String agentName;

    /** 业务输入参数 */
    private Map<String, Object> input;

    /** 元数据 */
    private Map<String, Object> metadata;
}
