package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 单个 HTTP 请求头 / 响应头（名称 + 值）。
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "HTTP 头（名称 + 值）")
public class HttpRequestHeader {

    @Schema(description = "头名称", example = "Content-Type")
    private String name;

    @Schema(description = "头值", example = "application/json")
    private String value;
}
