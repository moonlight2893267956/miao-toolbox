package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * SSL/TLS 证书分析响应。
 */
@Getter
@Setter
@Builder
@Schema(description = "SSL/TLS 证书分析响应")
public class SslAnalyzerResponse {

    @Schema(description = "目标主机")
    private String host;

    @Schema(description = "端口")
    private int port;

    @Schema(description = "解析后的 IP")
    private String resolvedIp;

    @Schema(description = "协商的 TLS 协议版本", example = "TLSv1.3")
    private String protocol;

    @Schema(description = "协商的加密套件", example = "TLS_AES_256_GCM_SHA384")
    private String cipherSuite;

    @Schema(description = "证书链是否被系统 CA 信任")
    private boolean peerVerified;

    @Schema(description = "证书校验错误信息（未通过信任校验时）")
    private String certificateError;

    @Schema(description = "证书链（leaf → root）")
    @Builder.Default
    private List<SslCertificateInfo> chain = new ArrayList<>();

    @Schema(description = "握手耗时（毫秒）")
    private long handshakeTimeMs;

    @Schema(description = "是否成功完成握手")
    private boolean success;

    @Schema(description = "错误信息（握手失败时）")
    private String errorMessage;
}
