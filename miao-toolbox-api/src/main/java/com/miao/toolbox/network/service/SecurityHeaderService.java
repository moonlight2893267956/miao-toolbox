package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.SecurityHeaderCheckRequest;
import com.miao.toolbox.network.dto.SecurityHeaderCheckResponse;
import com.miao.toolbox.network.dto.SecurityHeaderItem;
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
 * 安全响应头检查服务。
 *
 * <p>服务端代为 {@code GET}（回退 {@code HEAD}）请求，逐项检查六个关键安全响应头，
 * 缺失项标红并给出推荐配置模板，最后根据通过情况给出 A-F 综合等级。
 * 请求经 {@link HttpFetcher} 转发，具备 SSRF 防护。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SecurityHeaderService {

    private final HttpFetcher httpFetcher;

    private static final long TIMEOUT_MS = 8000;

    /** 每个安全头的定义：响应头名 / 缺失严重级别 / 缺失时的推荐模板。 */
    private static final List<HeaderSpec> SPECS = List.of(
            new HeaderSpec("Strict-Transport-Security",
                    "high",
                    "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload"),
            new HeaderSpec("Content-Security-Policy",
                    "high",
                    "Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self'"),
            new HeaderSpec("X-Content-Type-Options",
                    "medium",
                    "X-Content-Type-Options: nosniff"),
            new HeaderSpec("X-Frame-Options",
                    "medium",
                    "X-Frame-Options: DENY"),
            new HeaderSpec("Referrer-Policy",
                    "low",
                    "Referrer-Policy: strict-origin-when-cross-origin"),
            new HeaderSpec("Permissions-Policy",
                    "low",
                    "Permissions-Policy: geolocation=(), camera=(), microphone=()"));

    /** 缺失时的扣分权重（与严重级别对应）。 */
    private static final Map<String, Integer> DEDUCT = Map.of(
            "high", 20,
            "medium", 12,
            "low", 8);

    public SecurityHeaderCheckResponse check(SecurityHeaderCheckRequest req) {
        String url = req.getUrl();
        if (url == null || url.isBlank()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 不能为空", 400);
        }
        long timeout = req.getTimeoutMs() > 0 ? req.getTimeoutMs() : TIMEOUT_MS;

        HttpFetchResult r;
        try {
            r = httpFetcher.fetch(url.trim(), "GET", null, timeout);
        } catch (HttpFetchException e) {
            // 部分站点不支持 GET，回退 HEAD
            try {
                r = httpFetcher.fetch(url.trim(), "HEAD", null, timeout);
            } catch (HttpFetchException e2) {
                return SecurityHeaderCheckResponse.builder()
                        .success(false)
                        .errorMessage(e2.getMessage())
                        .build();
            } catch (BusinessException be) {
                throw be;
            }
        } catch (BusinessException e) {
            throw e;
        }

        Map<String, String> headers = r.headers();
        List<SecurityHeaderItem> items = new ArrayList<>();
        int deduction = 0;
        for (HeaderSpec spec : SPECS) {
            String value = firstIgnoreCase(headers, spec.name.toLowerCase(Locale.ROOT));
            boolean present = value != null && !value.isBlank();
            if (!present) {
                deduction += DEDUCT.getOrDefault(spec.severity, 10);
            }
            items.add(SecurityHeaderItem.builder()
                    .name(spec.name)
                    .present(present)
                    .value(present ? value : null)
                    .severity(spec.severity)
                    .recommendation(present ? null : spec.recommendation)
                    .build());
        }

        int score = Math.max(0, 100 - deduction);
        return SecurityHeaderCheckResponse.builder()
                .success(true)
                .finalUrl(r.finalUrl())
                .statusCode(r.statusCode())
                .items(items)
                .score(score)
                .grade(gradeOf(score))
                .build();
    }

    private static String gradeOf(int score) {
        if (score >= 90) return "A";
        if (score >= 75) return "B";
        if (score >= 60) return "C";
        if (score >= 40) return "D";
        if (score >= 20) return "E";
        return "F";
    }

    private static String firstIgnoreCase(Map<String, String> headers, String name) {
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (e.getKey().toLowerCase(Locale.ROOT).equals(name)) {
                return e.getValue();
            }
        }
        return null;
    }

    /** 安全头规格（不可变）。 */
    private static final class HeaderSpec {
        final String name;
        final String severity;
        final String recommendation;

        HeaderSpec(String name, String severity, String recommendation) {
            this.name = name;
            this.severity = severity;
            this.recommendation = recommendation;
        }
    }
}
