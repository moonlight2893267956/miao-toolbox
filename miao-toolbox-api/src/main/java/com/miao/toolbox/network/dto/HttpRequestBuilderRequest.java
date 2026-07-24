package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * HTTP 请求构建器请求：服务端代理发起一次任意 HTTP 请求。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "HTTP 请求构建器请求")
public class HttpRequestBuilderRequest {

    @NotBlank(message = "URL 不能为空")
    @Schema(description = "目标 URL（仅支持 http/https）", example = "https://api.example.com/v1/users")
    private String url;

    @Schema(description = "HTTP 方法（GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS/TRACE，默认 GET）", example = "POST")
    private String method;

    @Schema(description = "自定义请求头列表")
    private List<HttpRequestHeader> headers;

    @Schema(description = "请求体类型：json / form / raw（默认 raw）", example = "json")
    private String bodyType;

    @Schema(description = "请求体内容（JSON 文本 / urlencoded 表单 / 任意原始文本）")
    private String body;

    @Schema(description = "超时时间（毫秒，1000-60000，默认 15000）", example = "15000")
    private Integer timeoutMs;
}
