package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.CorsCheckRequest;
import com.miao.toolbox.network.dto.CorsCheckResult;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CorsCheckServiceTest {

    @Mock
    private HttpFetcher httpFetcher;

    @InjectMocks
    private CorsCheckService service;

    private HttpFetchResult result(Map<String, String> headers) {
        return new HttpFetchResult(204, "No Content", "https://api.example.com", headers, 12L);
    }

    @Test
    void check_wildcardNoOrigin_allowed() {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("access-control-allow-origin", "*");
        when(httpFetcher.fetch(any(), eq("OPTIONS"), any(), anyLong())).thenReturn(result(h));

        CorsCheckResult r = service.check(CorsCheckRequest.builder().url("https://api.example.com").build());
        assertTrue(r.isSuccess());
        assertTrue(r.isAllowed());
        assertEquals("*", r.getAllowOrigin());
        assertTrue(r.getIssues().isEmpty());
    }

    @Test
    void check_originMismatch_notAllowedWithIssue() {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("access-control-allow-origin", "https://a.com");
        when(httpFetcher.fetch(any(), eq("OPTIONS"), any(), anyLong())).thenReturn(result(h));

        CorsCheckResult r = service.check(
                CorsCheckRequest.builder().url("https://api.example.com").origin("https://b.com").build());
        assertFalse(r.isAllowed());
        assertEquals(1, r.getIssues().size());
        assertEquals("medium", r.getIssues().get(0).getSeverity());
    }

    @Test
    void check_originMatches_allowed() {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("access-control-allow-origin", "https://b.com");
        when(httpFetcher.fetch(any(), eq("OPTIONS"), any(), anyLong())).thenReturn(result(h));

        CorsCheckResult r = service.check(
                CorsCheckRequest.builder().url("https://api.example.com").origin("https://b.com").build());
        assertTrue(r.isAllowed());
        assertTrue(r.getIssues().isEmpty());
    }

    @Test
    void check_wildcardWithCredentials_highIssueAndNotAllowed() {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("access-control-allow-origin", "*");
        h.put("access-control-allow-credentials", "true");
        when(httpFetcher.fetch(any(), eq("OPTIONS"), any(), anyLong())).thenReturn(result(h));

        CorsCheckResult r = service.check(
                CorsCheckRequest.builder().url("https://api.example.com").origin("https://b.com").build());
        assertFalse(r.isAllowed());
        assertEquals(1, r.getIssues().size());
        assertEquals("high", r.getIssues().get(0).getSeverity());
    }

    @Test
    void check_missingAllowOrigin_notAllowed() {
        when(httpFetcher.fetch(any(), eq("OPTIONS"), any(), anyLong())).thenReturn(result(new LinkedHashMap<>()));

        CorsCheckResult r = service.check(CorsCheckRequest.builder().url("https://api.example.com").build());
        assertFalse(r.isAllowed());
        assertEquals(1, r.getIssues().size());
        assertEquals("medium", r.getIssues().get(0).getSeverity());
    }

    @Test
    void check_fetchFails_successFalse() {
        when(httpFetcher.fetch(any(), eq("OPTIONS"), any(), anyLong()))
                .thenThrow(new HttpFetchException("connection refused", new RuntimeException("x"), 5L));

        CorsCheckResult r = service.check(CorsCheckRequest.builder().url("https://api.example.com").build());
        assertFalse(r.isSuccess());
        assertEquals("connection refused", r.getErrorMessage());
    }

    @Test
    void check_emptyUrl_throws() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.check(CorsCheckRequest.builder().url("  ").build()));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
        assertEquals(400, ex.getHttpStatus());
    }
}
