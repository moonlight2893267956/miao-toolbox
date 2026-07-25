package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** CORS 策略检查请求：目标 URL + 可选自定义 Origin。 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "CORS 策略检查请求")
public class CorsCheckRequest {

    @Schema(description = "待检查的目标 URL（仅 http/https）", example = "https://api.example.com/v1/users")
    private String url;

    @Schema(description = "可选的自定义 Origin，用于验证该来源是否被允许跨域；留空则只检查是否配置了 CORS",
            example = "https://app.example.com")
    private String origin;
}
