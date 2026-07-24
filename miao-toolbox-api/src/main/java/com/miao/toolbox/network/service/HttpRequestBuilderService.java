package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.HttpRequestBuilderRequest;
import com.miao.toolbox.network.dto.HttpRequestBuilderResponse;
import com.miao.toolbox.network.dto.HttpRequestHeader;
import com.miao.toolbox.network.infrastructure.HttpRequestExecutor;
import com.miao.toolbox.network.infrastructure.NetworkTimeoutConfig;
import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * HTTP 请求构建器服务：校验入参、调用 {@link HttpRequestExecutor} 代理发请求，
 * 并将网络层异常（SSRF 拦截、DNS 失败、超时、连接失败等）统一降级为
 * {@code success=false, errorMessage=...} 的友好响应，与 {@code HttpHeaderAnalyzerService}
 * 的降级策略保持一致。
 */
@Service
@RequiredArgsConstructor
public class HttpRequestBuilderService {

    private static final int MAX_URL_LEN = 2048;
    private static final int MAX_HEADERS = 50;
    private static final int MAX_BODY_LEN = 5_000_000;
    private static final Set<String> ALLOWED_METHODS = Set.of(
        "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"
    );
    private static final Set<String> ALLOWED_BODY_TYPES = Set.of("json", "form", "raw");

    private final HttpRequestExecutor httpRequestExecutor;

    public HttpRequestBuilderResponse execute(HttpRequestBuilderRequest req) {
        String url = req.getUrl() == null ? "" : req.getUrl().trim();
        if (url.isEmpty()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 不能为空");
        }
        if (url.length() > MAX_URL_LEN) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 过长（上限 " + MAX_URL_LEN + " 字符）");
        }
        try {
            URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 格式非法");
        }
        String scheme = extractScheme(url);
        if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "仅支持 http/https 协议");
        }

        String method = req.getMethod() == null ? "GET" : req.getMethod().trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_METHODS.contains(method)) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "不支持的 HTTP 方法：" + method);
        }

        int timeoutMs = req.getTimeoutMs() != null ? req.getTimeoutMs() : (int) NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        if (timeoutMs < 1000 || timeoutMs > 60000) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "超时时间需在 1000-60000 毫秒之间");
        }

        List<HttpRequestHeader> headers = req.getHeaders() == null ? List.of() : req.getHeaders();
        if (headers.size() > MAX_HEADERS) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "请求头数量过多（上限 " + MAX_HEADERS + "）");
        }
        String body = req.getBody();
        if (body != null && body.length() > MAX_BODY_LEN) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "请求体过大（上限 5MB）");
        }
        String bodyType = req.getBodyType();
        if (bodyType != null && !ALLOWED_BODY_TYPES.contains(bodyType.toLowerCase(Locale.ROOT))) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "不支持的 Body 类型：" + bodyType);
        }

        HttpRequestExecutor.Spec spec = new HttpRequestExecutor.Spec(
            url,
            method,
            headers.stream()
                .map(h -> new HttpRequestExecutor.Header(h.getName(), h.getValue()))
                .collect(Collectors.toList()),
            bodyType,
            body,
            timeoutMs
        );

        HttpRequestExecutor.Execution ex;
        try {
            ex = httpRequestExecutor.send(spec);
        } catch (BusinessException e) {
            return graceful(e);
        }

        return HttpRequestBuilderResponse.builder()
            .statusCode(ex.statusCode())
            .statusText(ex.statusText())
            .finalUrl(ex.finalUrl())
            .headers(ex.headers().stream()
                .map(h -> HttpRequestHeader.builder().name(h.name()).value(h.value()).build())
                .collect(Collectors.toList()))
            .body(ex.body())
            .bodyBytes(ex.bodyBytes())
            .truncated(ex.truncated())
            .elapsedMs(ex.elapsedMs())
            .success(true)
            .errorMessage(null)
            .build();
    }

    private HttpRequestBuilderResponse graceful(BusinessException e) {
        return HttpRequestBuilderResponse.builder()
            .statusCode(0)
            .headers(List.of())
            .body(null)
            .bodyBytes(0)
            .truncated(false)
            .success(false)
            .errorMessage(friendly(e))
            .build();
    }

    private String friendly(BusinessException e) {
        String code = e.getErrorCode();
        if (ErrorCode.NETWORK_DNS_RESOLVE_FAILED.equals(code)) {
            return "无法解析该域名，请检查域名是否正确：" + (e.getMessage() == null ? "" : e.getMessage());
        }
        if (ErrorCode.NETWORK_SSRF_BLOCKED.equals(code)) {
            return "目标地址不允许访问（受保护网段）：" + (e.getMessage() == null ? "" : e.getMessage());
        }
        if (ErrorCode.NETWORK_CONNECTION_TIMEOUT.equals(code)) {
            return "请求超时，请稍后重试或增大超时时间";
        }
        return "HTTP 请求失败：" + (e.getMessage() == null ? "" : e.getMessage());
    }

    private String extractScheme(String url) {
        int idx = url.indexOf(':');
        if (idx <= 0) {
            return null;
        }
        return url.substring(0, idx);
    }
}
