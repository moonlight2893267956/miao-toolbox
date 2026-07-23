package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * 单张证书的信息。chain 中 index=0 为叶子证书（服务端证书）。
 */
@Getter
@Setter
@Builder
@Schema(description = "单张证书信息")
public class SslCertificateInfo {

    @Schema(description = "在证书链中的序号，0 为叶子证书")
    private int index;

    @Schema(description = "主题（Subject）")
    private String subject;

    @Schema(description = "颁发者（Issuer）")
    private String issuer;

    @Schema(description = "序列号（十六进制）")
    private String serialNumber;

    @Schema(description = "有效期起始（ISO-8601）")
    private String notBefore;

    @Schema(description = "有效期截止（ISO-8601）")
    private String notAfter;

    @Schema(description = "距过期剩余天数（负数表示已过期）")
    private long daysRemaining;

    @Schema(description = "是否已过期")
    private boolean expired;

    @Schema(description = "签名算法")
    private String signatureAlgorithm;

    @Schema(description = "公钥算法")
    private String publicKeyAlgorithm;

    @Schema(description = "公钥长度（bit）")
    private int publicKeySize;

    @Schema(description = "主题备用名称（SAN）")
    @Builder.Default
    private List<String> san = new ArrayList<>();

    @Schema(description = "结构化键值字段")
    @Builder.Default
    private List<SslCertificateField> fields = new ArrayList<>();
}
