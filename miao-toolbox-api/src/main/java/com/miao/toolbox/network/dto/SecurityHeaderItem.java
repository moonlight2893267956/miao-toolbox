package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 单个安全响应头的检查项。 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "安全响应头检查项")
public class SecurityHeaderItem {

    @Schema(description = "响应头名称", example = "Strict-Transport-Security")
    private String name;

    @Schema(description = "是否命中（存在且非空）")
    private boolean present;

    @Schema(description = "实际取值（缺失为 null）")
    private String value;

    @Schema(description = "缺失时的严重级别：high / medium / low", example = "high")
    private String severity;

    @Schema(description = "缺失时的推荐配置模板")
    private String recommendation;
}
