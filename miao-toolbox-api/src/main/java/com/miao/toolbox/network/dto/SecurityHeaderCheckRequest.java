package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 安全响应头检查请求。 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "安全响应头检查请求")
public class SecurityHeaderCheckRequest {

    @Schema(description = "待检查的目标 URL（仅 http/https）", example = "https://example.com")
    private String url;

    @Schema(description = "请求超时（毫秒），<=0 使用默认", example = "8000")
    @Builder.Default
    private long timeoutMs = 0;
}
