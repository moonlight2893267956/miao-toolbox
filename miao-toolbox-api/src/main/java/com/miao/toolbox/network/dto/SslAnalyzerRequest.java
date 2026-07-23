package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * SSL/TLS 证书分析请求。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "SSL/TLS 证书分析请求")
public class SslAnalyzerRequest {

    @NotBlank(message = "主机不能为空")
    @Schema(description = "目标主机（域名或 IP）", example = "example.com")
    private String host;

    @Schema(description = "端口，默认 443", example = "443")
    private Integer port = 443;

    @Schema(description = "超时（毫秒），1000-55000，默认 15000", example = "15000")
    private Integer timeoutMs;
}
