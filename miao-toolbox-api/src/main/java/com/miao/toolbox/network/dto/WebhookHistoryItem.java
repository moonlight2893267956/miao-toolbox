package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Map;

/**
 * 单条收到的 Webhook 请求记录。
 *
 * <p>同时作为：① Redis 历史列表的存储结构；② SSE 实时推送给前端的事件载荷。
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Webhook 收到的请求记录")
public class WebhookHistoryItem {

    @Schema(description = "请求记录唯一 ID", example = "f47ac10b-...")
    private String id;

    @Schema(description = "接收时间戳（毫秒 epoch）", example = "1763913601000")
    private long receivedAt;

    @Schema(description = "HTTP 方法", example = "POST")
    private String method;

    @Schema(description = "来源 IP", example = "203.0.113.5")
    private String sourceIp;

    @Schema(description = "请求路径", example = "/api/network/webhook/a1b2c3")
    private String path;

    @Schema(description = "查询参数（多值取首值）")
    private Map<String, String> queryParams;

    @Schema(description = "请求头")
    private Map<String, String> headers;

    @Schema(description = "请求体（文本，最大 1MB）")
    private String body;

    @Schema(description = "请求体字节数", example = "256")
    private long sizeBytes;

    @Schema(description = "端点本次实际返回的 HTTP 状态码", example = "200")
    private int responseStatusCode;

    @Schema(description = "端点本次实际返回的响应头")
    private Map<String, String> responseHeaders;

    @Schema(description = "端点本次实际返回的响应体（文本）")
    private String responseBody;
}
