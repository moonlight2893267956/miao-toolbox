package com.miao.toolbox.network.service;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.SecurityHeaderCheckRequest;
import com.miao.toolbox.network.dto.SecurityHeaderCheckResponse;
import com.miao.toolbox.network.dto.SecurityHeaderItem;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import com.miao.toolbox.network.infrastructure.HttpFetcher.HttpFetchException;
import com.miao.toolbox.network.infrastructure.HttpFetcher.HttpFetchResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SecurityHeaderServiceTest {

    @Mock
    private HttpFetcher httpFetcher;

    @InjectMocks
    private SecurityHeaderService service;

    private HttpFetchResult result(Map<String, String> headers) {
        return new HttpFetchResult(200, "OK", "https://example.com", headers, 15L);
    }

    @Test
    void check_allPresent_gradeA() {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
        h.put("Content-Security-Policy", "default-src 'self'");
        h.put("X-Content-Type-Options", "nosniff");
        h.put("X-Frame-Options", "DENY");
        h.put("Referrer-Policy", "strict-origin-when-cross-origin");
        h.put("Permissions-Policy", "geolocation=()");
        when(httpFetcher.fetch(any(), eq("GET"), any(), anyLong())).thenReturn(result(h));

        SecurityHeaderCheckResponse r = service.check(
                SecurityHeaderCheckRequest.builder().url("https://example.com").build());
        assertTrue(r.isSuccess());
        assertEquals("A", r.getGrade());
        assertEquals(100, r.getScore());
        assertTrue(r.getItems().stream().allMatch(SecurityHeaderItem::isPresent));
    }

    @Test
    void check_missingHighHeaders_lowersScore() {
        Map<String, String> h = new LinkedHashMap<>();
        // 仅配置 4 个：X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy
        h.put("X-Content-Type-Options", "nosniff");
        h.put("X-Frame-Options", "DENY");
        h.put("Referrer-Policy", "strict-origin-when-cross-origin");
        h.put("Permissions-Policy", "geolocation=()");
        when(httpFetcher.fetch(any(), eq("GET"), any(), anyLong())).thenReturn(result(h));

        SecurityHeaderCheckResponse r = service.check(
                SecurityHeaderCheckRequest.builder().url("https://example.com").build());
        assertTrue(r.isSuccess());
        // 缺失 HSTS(high -20) + CSP(high -20) => 60 => C
        assertEquals(60, r.getScore());
        assertEquals("C", r.getGrade());
        Optional<SecurityHeaderItem> hsts = r.getItems().stream()
                .filter(i -> "Strict-Transport-Security".equals(i.getName())).findFirst();
        assertTrue(hsts.isPresent());
        assertFalse(hsts.get().isPresent());
        assertEquals("high", hsts.get().getSeverity());
    }

    @Test
    void check_getFailsFallbackHeadSuccess() {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("Strict-Transport-Security", "max-age=63072000");
        h.put("Content-Security-Policy", "default-src 'self'");
        h.put("X-Content-Type-Options", "nosniff");
        h.put("X-Frame-Options", "DENY");
        h.put("Referrer-Policy", "strict-origin-when-cross-origin");
        h.put("Permissions-Policy", "geolocation=()");
        when(httpFetcher.fetch(any(), eq("GET"), any(), anyLong()))
                .thenThrow(new HttpFetchException("GET refused", new RuntimeException("x"), 5L));
        when(httpFetcher.fetch(any(), eq("HEAD"), any(), anyLong())).thenReturn(result(h));

        SecurityHeaderCheckResponse r = service.check(
                SecurityHeaderCheckRequest.builder().url("https://example.com").build());
        assertTrue(r.isSuccess());
        assertEquals("A", r.getGrade());
    }

    @Test
    void check_bothMethodsFail_successFalse() {
        when(httpFetcher.fetch(any(), eq("GET"), any(), anyLong()))
                .thenThrow(new HttpFetchException("GET refused", new RuntimeException("x"), 5L));
        when(httpFetcher.fetch(any(), eq("HEAD"), any(), anyLong()))
                .thenThrow(new HttpFetchException("HEAD refused", new RuntimeException("x"), 5L));

        SecurityHeaderCheckResponse r = service.check(
                SecurityHeaderCheckRequest.builder().url("https://example.com").build());
        assertFalse(r.isSuccess());
        assertEquals("HEAD refused", r.getErrorMessage());
    }

    @Test
    void check_emptyUrl_throws() {
        assertThrows(BusinessException.class,
                () -> service.check(SecurityHeaderCheckRequest.builder().url("  ").build()));
    }
}
