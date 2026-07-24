package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.List;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

/**
 * HTTP 请求构建器响应：展示服务端代理请求的完整结果。
 *
 * <p>{@code success=true} 表示已成功与目标服务器完成 HTTP 交互（无论状态码是 2xx 还是 4xx/5xx）；
 * {@code success=false} 表示请求未能完成（SSRF 拦截、DNS 解析失败、连接超时/被拒等），
 * 此时 {@code errorMessage} 携带友好提示，{@code statusCode} 为 0。
 */
@Getter
@Setter
@Builder
@Schema(description = "HTTP 请求构建器响应")
public class HttpRequestBuilderResponse {

    @Schema(description = "HTTP 状态码（请求未完成时为 0）", example = "200")
    @Builder.Default
    private int statusCode = 0;

    @Schema(description = "状态码文本", example = "OK")
    private String statusText;

    @Schema(description = "最终请求 URL（未跟随重定向时等于请求 URL）")
    private String finalUrl;

    @Schema(description = "响应头列表")
    @Builder.Default
    private List<HttpRequestHeader> headers = new ArrayList<>();

    @Schema(description = "响应体（文本，最多 5MB，超出截断）")
    private String body;

    @Schema(description = "响应体字节数（截断前实际大小）", example = "2048")
    private long bodyBytes;

    @Schema(description = "响应体是否因超过上限被截断")
    @Builder.Default
    private boolean truncated = false;

    @Schema(description = "耗时（毫秒）", example = "326")
    private long elapsedMs;

    @Schema(description = "是否成功完成 HTTP 交互", example = "true")
    @Builder.Default
    private boolean success = false;

    @Schema(description = "失败时的友好提示（success=false 时非空）")
    private String errorMessage;
}
