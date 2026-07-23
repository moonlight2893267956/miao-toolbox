package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * HTTP 响应头字段（键值对）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "HTTP 响应头字段")
public class HttpHeaderField {

    @Schema(description = "响应头名称", example = "Content-Type")
    private String key;

    @Schema(description = "响应头值", example = "text/html; charset=utf-8")
    private String value;
}
