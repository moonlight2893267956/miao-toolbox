package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

/**
 * HTTP Header 分析响应。
 */
@Getter
@Setter
@Builder
@Schema(description = "HTTP Header 分析响应")
public class HttpHeaderAnalyzerResponse {

    @Schema(description = "请求 URL", example = "https://example.com")
    private String url;

    @Schema(description = "HTTP 状态码", example = "200")
    private int statusCode;

    @Schema(description = "状态文本", example = "OK")
    private String statusText;

    @Schema(description = "最终 URL（重定向后）", example = "https://example.com/")
    private String finalUrl;

    @Schema(description = "请求耗时（毫秒）", example = "123")
    private long elapsedMs;

    @Schema(description = "按类别分组的响应头")
    @Builder.Default
    private Map<String, List<HttpHeaderField>> categories = new HashMap<>();

    @Schema(description = "缺失的关键安全响应头（标准头名）")
    @Builder.Default
    private List<String> missingSecurityHeaders = new ArrayList<>();

    @Schema(description = "是否成功", example = "true")
    private boolean success;

    @Schema(description = "失败时的错误信息", example = "null")
    private String errorMessage;
}
