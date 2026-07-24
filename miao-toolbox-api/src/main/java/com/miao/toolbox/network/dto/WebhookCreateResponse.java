package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

/**
 * 创建 Webhook 端点后的返回：含随机 hookId、可公开访问的完整 URL、过期时间戳。
 */
@Getter
@Setter
@Builder
@Schema(description = "创建 Webhook 端点响应")
public class WebhookCreateResponse {

    @Schema(description = "随机端点 ID（即 URL 路径中的凭证，不可猜测）", example = "a1b2c3d4e5f6...")
    private String hookId;

    @Schema(description = "可公开访问的完整 Webhook URL（交给第三方回调）")
    private String url;

    @Schema(description = "端点过期时间戳（毫秒 epoch）；默认创建后 24 小时", example = "1764000000000")
    private long expiresAt;
}
