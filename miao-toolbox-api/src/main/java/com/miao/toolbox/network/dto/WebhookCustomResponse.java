package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Map;

/**
 * 用户对 Webhook 端点配置的自定义响应。
 *
 * <p>当 {@code statusCode <= 0}（或对象为空）时，表示使用默认响应（200 + 标准 JSON）。
 * 响应头仅在自定义响应激活（statusCode > 0）时生效。
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Webhook 自定义响应配置")
public class WebhookCustomResponse {

    @Schema(description = "自定义 HTTP 状态码（100-599）；<=0 表示使用默认响应", example = "201")
    @Builder.Default
    private int statusCode = 0;

    @Schema(description = "自定义响应体（文本，建议为 JSON）；默认响应时忽略", example = "{\"ok\":true}")
    private String body;

    @Schema(description = "自定义响应头（name=value）；仅 statusCode>0 时随响应返回。Content-Type/Content-Length 由系统控制，将被忽略", example = "{\"X-Request-Id\":\"abc\"}")
    @Builder.Default
    private Map<String, String> headers = Map.of();
}
