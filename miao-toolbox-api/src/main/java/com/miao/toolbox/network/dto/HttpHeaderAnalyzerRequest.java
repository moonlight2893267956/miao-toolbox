package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * HTTP Header 分析请求。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "HTTP Header 分析请求")
public class HttpHeaderAnalyzerRequest {

    @NotBlank(message = "URL 不能为空")
    @Schema(description = "目标 URL（仅支持 http/https）", example = "https://example.com")
    private String url;

    @Schema(description = "超时时间（毫秒，1000-60000，默认 15000）", example = "15000")
    private Integer timeoutMs;
}
