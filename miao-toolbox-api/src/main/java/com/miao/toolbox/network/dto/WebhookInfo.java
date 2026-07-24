package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

/**
 * Webhook 端点元信息（供前端展示状态、剩余时间、自定义响应）。
 */
@Getter
@Setter
@Builder
@Schema(description = "Webhook 端点信息")
public class WebhookInfo {

    @Schema(description = "端点 ID", example = "a1b2c3d4e5f6...")
    private String hookId;

    @Schema(description = "创建时间戳（毫秒 epoch）", example = "1763913600000")
    private long createdAt;

    @Schema(description = "过期时间戳（毫秒 epoch）", example = "1764000000000")
    private long expiresAt;

    @Schema(description = "已接收请求数（历史保留上限 50）", example = "12")
    private long requestCount;

    @Schema(description = "自定义响应配置（null 表示使用默认响应）")
    private WebhookCustomResponse customResponse;
}
