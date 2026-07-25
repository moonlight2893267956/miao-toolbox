package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.CorsCheckRequest;
import com.miao.toolbox.network.dto.CorsCheckResult;
import com.miao.toolbox.network.dto.CorsIssue;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import com.miao.toolbox.network.infrastructure.HttpFetcher.HttpFetchException;
import com.miao.toolbox.network.infrastructure.HttpFetcher.HttpFetchResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * CORS 策略检查服务。
 *
 * <p>服务端代为发送 {@code OPTIONS} 预检请求，解析 {@code Access-Control-Allow-*} 响应头，
 * 判断是否允许指定 {@code Origin} 跨域，并在配置有误时给出修复建议。
 * 请求经 {@link HttpFetcher} 转发，天然具备 SSRF 防护（仅公网、仅无 body 方法）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CorsCheckService {

    private final HttpFetcher httpFetcher;

    private static final long TIMEOUT_MS = 8000;
    private static final String HDR_ALLOW_ORIGIN = "access-control-allow-origin";
    private static final String HDR_ALLOW_METHODS = "access-control-allow-methods";
    private static final String HDR_ALLOW_HEADERS = "access-control-allow-headers";
    private static final String HDR_ALLOW_CREDENTIALS = "access-control-allow-credentials";

    public CorsCheckResult check(CorsCheckRequest req) {
        String url = req.getUrl();
        if (url == null || url.isBlank()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 不能为空", 400);
        }
        String origin = req.getOrigin();

        HttpFetchResult r;
        try {
            Map<String, String> headers = (origin != null && !origin.isBlank())
                    ? Map.of("Origin", origin.trim()) : Map.of();
            r = httpFetcher.fetch(url.trim(), "OPTIONS", headers, TIMEOUT_MS);
        } catch (HttpFetchException e) {
            return CorsCheckResult.builder()
                    .success(false)
                    .errorMessage(e.getMessage())
                    .build();
        } catch (BusinessException e) {
            // SSRF 拦截等：直接抛出，由全局异常处理器统一返回
            throw e;
        }

        Map<String, String> h = r.headers();
        String allowOrigin = firstIgnoreCase(h, HDR_ALLOW_ORIGIN);
        String allowMethods = firstIgnoreCase(h, HDR_ALLOW_METHODS);
        String allowHeaders = firstIgnoreCase(h, HDR_ALLOW_HEADERS);
        String allowCredentials = firstIgnoreCase(h, HDR_ALLOW_CREDENTIALS);

        List<CorsIssue> issues = new ArrayList<>();
        boolean allowed;
        if (allowOrigin == null || allowOrigin.isBlank()) {
            allowed = false;
            issues.add(CorsIssue.builder()
                    .severity("medium")
                    .message("未返回 Access-Control-Allow-Origin，目标接口未配置跨域")
                    .fix("在响应中添加 Access-Control-Allow-Origin（具体来源或 *）")
                    .build());
        } else {
            String ao = allowOrigin.trim();
            boolean wildcard = "*".equals(ao);
            boolean credentialed = "true".equalsIgnoreCase(
                    allowCredentials == null ? "" : allowCredentials.trim());
            if (wildcard && credentialed) {
                allowed = false;
                issues.add(CorsIssue.builder()
                        .severity("high")
                        .message("Allow-Origin 为 * 但同时 Allow-Credentials 为 true，浏览器将拒绝该组合")
                        .fix("将 Allow-Origin 改为具体来源（不能含 *），或移除 Allow-Credentials")
                        .build());
            } else if (origin != null && !origin.isBlank()) {
                if (wildcard) {
                    allowed = true;
                } else if (origin.trim().equalsIgnoreCase(ao)) {
                    allowed = true;
                } else {
                    allowed = false;
                    issues.add(CorsIssue.builder()
                            .severity("medium")
                            .message("Allow-Origin 不含指定 Origin（" + origin.trim() + "），跨域请求将被浏览器拒绝")
                            .fix("将 Allow-Origin 改为 " + origin.trim() + "，或返回列出该来源的名单")
                            .build());
                }
            } else {
                // 未指定 origin：只要配置了 CORS 即视为允许任意跨域（受限于 credentials 规则）
                allowed = true;
            }
        }

        if (allowCredentials != null && !allowCredentials.isBlank()
                && !"true".equalsIgnoreCase(allowCredentials.trim())
                && !"false".equalsIgnoreCase(allowCredentials.trim())) {
            issues.add(CorsIssue.builder()
                    .severity("low")
                    .message("Allow-Credentials 取值异常：" + allowCredentials.trim())
                    .fix("Allow-Credentials 应为 true 或 false")
                    .build());
        }

        return CorsCheckResult.builder()
                .success(true)
                .finalUrl(r.finalUrl())
                .statusCode(r.statusCode())
                .allowOrigin(allowOrigin)
                .allowMethods(allowMethods)
                .allowHeaders(allowHeaders)
                .allowCredentials(allowCredentials)
                .allowed(allowed)
                .issues(issues)
                .build();
    }

    private static String firstIgnoreCase(Map<String, String> headers, String name) {
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (e.getKey().toLowerCase(Locale.ROOT).equals(name)) {
                return e.getValue();
            }
        }
        return null;
    }
}
