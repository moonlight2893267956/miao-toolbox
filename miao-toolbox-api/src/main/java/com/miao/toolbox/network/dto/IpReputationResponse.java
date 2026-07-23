package com.miao.toolbox.network.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.List;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

/**
 * IP 信誉检查响应。
 */
@Getter
@Setter
@Builder
@Schema(description = "IP 信誉检查响应")
public class IpReputationResponse {

    @Schema(description = "查询的 IP", example = "8.8.8.8")
    private String ip;

    @Schema(description = "滥用置信评分（0-100）", example = "0")
    private int abuseConfidenceScore;

    @Schema(description = "举报总次数", example = "0")
    private int totalReports;

    @Schema(description = "最近举报时间", example = "2024-01-01T00:00:00+00:00")
    private String lastReportedAt;

    @Schema(description = "是否为公共 IP", example = "true")
    @JsonProperty("isPublic")
    private boolean isPublic;

    @Schema(description = "是否白名单", example = "false")
    @JsonProperty("isWhitelisted")
    private boolean isWhitelisted;

    @Schema(description = "关联域名", example = "dns.google")
    private String domain;

    @Schema(description = "用途类型", example = "Content Delivery Network")
    private String usageType;

    @Schema(description = "国家代码", example = "US")
    private String countryCode;

    @Schema(description = "ISP", example = "Google LLC")
    private String isp;

    @Schema(description = "举报记录")
    @Builder.Default
    private List<IpReputationReport> reports = new ArrayList<>();

    @Schema(description = "是否已配置 AbuseIPDB Key", example = "true")
    private boolean configured;

    @Schema(description = "是否成功", example = "true")
    private boolean success;

    @Schema(description = "友好提示信息（未配置/配额耗尽/错误时填充）", example = "null")
    private String message;
}
