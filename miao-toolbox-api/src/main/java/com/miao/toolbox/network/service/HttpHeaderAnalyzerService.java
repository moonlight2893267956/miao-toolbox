package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.HttpHeaderAnalyzerRequest;
import com.miao.toolbox.network.dto.HttpHeaderAnalyzerResponse;
import com.miao.toolbox.network.dto.HttpHeaderField;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import com.miao.toolbox.network.infrastructure.NetworkTimeoutConfig;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * HTTP Header 分析服务：抓取响应头并按类别分组，标记缺失的关键安全响应头。
 *
 * <p>网络层异常（DNS 解析失败、SSRF 拦截、连接超时、连接失败等）一律以
 * {@code success=true, errorMessage="..."} 的友好响应返回，与
 * {@code IpReputationService} 的降级策略保持一致，避免前端展示裸 HTTP 状态码。
 */
@Service
@RequiredArgsConstructor
public class HttpHeaderAnalyzerService {

    private final HttpFetcher httpFetcher;

    private static final int MAX_URL_LEN = 2048;

    /** 关键安全响应头：标准名 -> 视为「已配置」的变体（小写） */
    private static final Map<String, List<String>> SECURITY_HEADER_VARIANTS = Map.of(
        "Strict-Transport-Security", List.of("strict-transport-security"),
        "Content-Security-Policy", List.of("content-security-policy", "content-security-policy-report-only"),
        "X-Content-Type-Options", List.of("x-content-type-options"),
        "X-Frame-Options", List.of("x-frame-options"),
        "Referrer-Policy", List.of("referrer-policy")
    );

    public HttpHeaderAnalyzerResponse analyze(HttpHeaderAnalyzerRequest req) {
        String url = req.getUrl() == null ? "" : req.getUrl().trim();
        if (url.isEmpty()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 不能为空");
        }
        if (url.length() > MAX_URL_LEN) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 过长（上限 " + MAX_URL_LEN + " 字符）");
        }
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 格式非法");
        }
        String scheme = uri.getScheme();
        if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "仅支持 http/https 协议");
        }

        long timeoutMs = req.getTimeoutMs() != null ? req.getTimeoutMs() : NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        if (timeoutMs < 1000 || timeoutMs > 60000) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "超时时间需在 1000-60000 毫秒之间");
        }

        HttpFetcher.HttpFetchResult result;
        try {
            result = httpFetcher.fetch(url, timeoutMs);
        } catch (BusinessException e) {
            // SSRF / DNS 等服务端校验失败 → 友好降级，不抛出
            return graceful(url, friendlyNetworkMessage(e));
        } catch (HttpFetcher.HttpFetchException e) {
            if (e.getCause() instanceof SocketTimeoutException) {
                return graceful(url, "HTTP 请求超时：" + url + "（" + e.getMessage() + "）");
            }
            return graceful(url, "HTTP 请求失败：" + e.getMessage());
        }

        Map<String, List<HttpHeaderField>> categories = classify(result.headers());
        List<String> missing = missingSecurityHeaders(result.headers());

        return HttpHeaderAnalyzerResponse.builder()
            .url(url)
            .statusCode(result.statusCode())
            .statusText(result.statusText())
            .finalUrl(result.finalUrl())
            .elapsedMs(result.elapsedMs())
            .categories(categories)
            .missingSecurityHeaders(missing)
            .success(true)
            .errorMessage(null)
            .build();
    }

    private HttpHeaderAnalyzerResponse graceful(String url, String message) {
        return HttpHeaderAnalyzerResponse.builder()
            .url(url)
            .categories(Map.of())
            .missingSecurityHeaders(List.of())
            .success(true)
            .errorMessage(message)
            .build();
    }

    private String friendlyNetworkMessage(BusinessException e) {
        String code = e.getErrorCode();
        if (ErrorCode.NETWORK_DNS_RESOLVE_FAILED.equals(code)) {
            return "无法解析该域名，请检查域名是否正确：" + (e.getMessage() == null ? "" : e.getMessage());
        }
        if (ErrorCode.NETWORK_SSRF_BLOCKED.equals(code)) {
            return "目标地址不允许访问（受保护网段）：" + (e.getMessage() == null ? "" : e.getMessage());
        }
        return "HTTP 请求失败：" + e.getMessage();
    }

    private Map<String, List<HttpHeaderField>> classify(Map<String, String> headers) {
        Map<String, List<HttpHeaderField>> categories = new TreeMap<>();
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            String category = categoryOf(entry.getKey());
            categories.computeIfAbsent(category, k -> new java.util.ArrayList<>())
                .add(new HttpHeaderField(entry.getKey(), entry.getValue()));
        }
        return categories;
    }

    private String categoryOf(String name) {
        String lower = name.toLowerCase();
        if (lower.startsWith("access-control-") || lower.equals("timing-allow-origin")) {
            return "CORS";
        }
        if (lower.contains("strict-transport-security")
            || lower.contains("content-security-policy")
            || lower.contains("x-content-type-options")
            || lower.contains("x-frame-options")
            || lower.contains("referrer-policy")
            || lower.contains("x-xss-protection")
            || lower.contains("permissions-policy")
            || lower.contains("cross-origin")) {
            return "安全";
        }
        if (lower.equals("cache-control") || lower.equals("expires") || lower.equals("pragma")
            || lower.equals("age") || lower.equals("etag") || lower.equals("last-modified")
            || lower.equals("vary")) {
            return "缓存";
        }
        if (lower.startsWith("content-")) {
            return "内容协商";
        }
        if (lower.equals("server") || lower.startsWith("x-powered-by") || lower.startsWith("x-aspnet")
            || lower.startsWith("x-generated-by") || lower.startsWith("x-runtime")
            || lower.startsWith("x-varnish") || lower.startsWith("x-drupal") || lower.startsWith("x-cache")) {
            return "服务器";
        }
        return "其他";
    }

    private List<String> missingSecurityHeaders(Map<String, String> headers) {
        Set<String> lowerKeys = headers.keySet().stream().map(String::toLowerCase).collect(java.util.stream.Collectors.toSet());
        List<String> missing = new java.util.ArrayList<>();
        for (Map.Entry<String, List<String>> entry : SECURITY_HEADER_VARIANTS.entrySet()) {
            boolean present = entry.getValue().stream().anyMatch(lowerKeys::contains);
            if (!present) {
                missing.add(entry.getKey());
            }
        }
        return missing;
    }
}