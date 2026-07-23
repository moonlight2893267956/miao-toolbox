package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * IP 信誉检查请求。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "IP 信誉检查请求")
public class IpReputationRequest {

    @NotBlank(message = "IP 不能为空")
    @Schema(description = "目标 IP（IPv4 或 IPv6 字面量）", example = "8.8.8.8")
    private String ip;

    @Schema(description = "统计窗口（天，1-365，默认 90）", example = "90")
    private Integer maxAgeInDays;
}
