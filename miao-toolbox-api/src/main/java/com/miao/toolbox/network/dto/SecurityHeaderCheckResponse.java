package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/** 安全响应头检查结果：逐项状态 + A-F 综合评分。 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "安全响应头检查结果")
public class SecurityHeaderCheckResponse {

    @Schema(description = "请求是否成功完成（网络/SSRF 失败时为 false）")
    @Builder.Default
    private boolean success = true;

    @Schema(description = "失败原因（success=false 时存在）")
    private String errorMessage;

    @Schema(description = "最终请求 URL（含重定向后地址）")
    private String finalUrl;

    @Schema(description = "HTTP 状态码")
    private int statusCode;

    @Schema(description = "各安全头检查项")
    @Builder.Default
    private List<SecurityHeaderItem> items = List.of();

    @Schema(description = "综合安全评分（0-100）", example = "83")
    private int score;

    @Schema(description = "综合等级 A-F", example = "B")
    private String grade;
}
