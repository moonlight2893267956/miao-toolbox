package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 单张证书的键值字段（用于前端结构化展示）。
 */
@Getter
@AllArgsConstructor
@Schema(description = "证书键值字段")
public class SslCertificateField {

    @Schema(description = "字段名")
    private String key;

    @Schema(description = "字段值")
    private String value;
}
