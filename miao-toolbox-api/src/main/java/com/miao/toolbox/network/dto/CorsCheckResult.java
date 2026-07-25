package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/** CORS 策略检查结果：四项 CORS 响应头 + 跨域判定 + 问题列表。 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "CORS 策略检查结果")
public class CorsCheckResult {

    @Schema(description = "请求是否成功完成（网络/SSRF 失败时为 false）")
    @Builder.Default
    private boolean success = true;

    @Schema(description = "失败原因（success=false 时存在）")
    private String errorMessage;

    @Schema(description = "最终请求 URL（含重定向后地址）")
    private String finalUrl;

    @Schema(description = "HTTP 状态码")
    private int statusCode;

    @Schema(description = "Access-Control-Allow-Origin 实际值（可能为 null）")
    private String allowOrigin;

    @Schema(description = "Access-Control-Allow-Methods 实际值（可能为 null）")
    private String allowMethods;

    @Schema(description = "Access-Control-Allow-Headers 实际值（可能为 null）")
    private String allowHeaders;

    @Schema(description = "Access-Control-Allow-Credentials 实际值（可能为 null）")
    private String allowCredentials;

    @Schema(description = "指定 Origin 是否被允许跨域（origin 留空时表示是否配置了任意跨域）")
    private boolean allowed;

    @Schema(description = "CORS 配置问题列表")
    @Builder.Default
    private List<CorsIssue> issues = List.of();
}
