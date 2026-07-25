package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** CORS 配置问题项：严重级别 + 说明 + 修复建议。 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "CORS 配置问题项")
public class CorsIssue {

    @Schema(description = "严重级别：high / medium / low", example = "high")
    private String severity;

    @Schema(description = "问题描述", example = "Allow-Origin 为 * 但同时 Allow-Credentials 为 true")
    private String message;

    @Schema(description = "修复建议", example = "将 Allow-Origin 改为具体来源，或移除 Allow-Credentials")
    private String fix;
}
