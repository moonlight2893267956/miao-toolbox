package com.miao.toolbox.network.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.HttpHeaderAnalyzerRequest;
import com.miao.toolbox.network.dto.HttpHeaderAnalyzerResponse;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import java.net.SocketTimeoutException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class HttpHeaderAnalyzerServiceTest {

    @Mock
    private HttpFetcher httpFetcher;

    @InjectMocks
    private HttpHeaderAnalyzerService service;

    private HttpHeaderAnalyzerRequest req(String url, Integer timeout) {
        return new HttpHeaderAnalyzerRequest(url, timeout);
    }

    @Test
    void shouldRejectBlankUrl() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.analyze(req("  ", null)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldRejectNonHttpScheme() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.analyze(req("ftp://example.com", null)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldRejectOverlongUrl() {
        String longUrl = "https://example.com/" + "a".repeat(2100);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.analyze(req(longUrl, null)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldGracefullyReportSsrfBlocked() {
        when(httpFetcher.fetch(anyString(), anyLong()))
            .thenThrow(new BusinessException(ErrorCode.NETWORK_SSRF_BLOCKED, "blocked"));
        HttpHeaderAnalyzerResponse resp = service.analyze(req("https://169.254.169.254", null));
        assertTrue(resp.isSuccess(), "graceful response should mark success=true");
        assertNotNull(resp.getErrorMessage());
        assertTrue(resp.getErrorMessage().contains("不允许访问"), resp.getErrorMessage());
    }

    @Test
    void shouldGracefullyReportDnsFailure() {
        when(httpFetcher.fetch(anyString(), anyLong()))
            .thenThrow(new BusinessException(ErrorCode.NETWORK_DNS_RESOLVE_FAILED, "无法解析主机: no-such.example"));
        HttpHeaderAnalyzerResponse resp = service.analyze(req("https://no-such.example", null));
        assertTrue(resp.isSuccess());
        assertNotNull(resp.getErrorMessage());
        assertTrue(resp.getErrorMessage().contains("无法解析该域名"), resp.getErrorMessage());
    }

    @Test
    void shouldGracefullyReportTimeout() {
        HttpFetcher.HttpFetchException fetchEx =
            new HttpFetcher.HttpFetchException("timeout", new SocketTimeoutException("read timed out"), 123);
        when(httpFetcher.fetch(anyString(), anyLong())).thenThrow(fetchEx);
        HttpHeaderAnalyzerResponse resp = service.analyze(req("https://example.com", null));
        assertTrue(resp.isSuccess());
        assertNotNull(resp.getErrorMessage());
        assertTrue(resp.getErrorMessage().contains("请求超时"), resp.getErrorMessage());
    }

    @Test
    void shouldGracefullyReportGenericNetworkFailure() {
        HttpFetcher.HttpFetchException fetchEx =
            new HttpFetcher.HttpFetchException("conn refused", new java.net.ConnectException("refused"), 50);
        when(httpFetcher.fetch(anyString(), anyLong())).thenThrow(fetchEx);
        HttpHeaderAnalyzerResponse resp = service.analyze(req("https://example.com:9", null));
        assertTrue(resp.isSuccess());
        assertNotNull(resp.getErrorMessage());
        assertTrue(resp.getErrorMessage().contains("HTTP 请求失败"), resp.getErrorMessage());
    }

    @Test
    void shouldClassifyHeadersAndFlagMissingSecurity() {
        Map<String, String> headers = Map.of(
            "Content-Type", "text/html; charset=utf-8",
            "Server", "nginx",
            "Strict-Transport-Security", "max-age=31536000",
            "Cache-Control", "max-age=3600"
        );
        when(httpFetcher.fetch(anyString(), anyLong()))
            .thenReturn(new HttpFetcher.HttpFetchResult(200, "OK", "https://example.com/", headers, 50));

        HttpHeaderAnalyzerResponse resp = service.analyze(req("https://example.com", null));
        assertTrue(resp.isSuccess());
        assertEquals(200, resp.getStatusCode());
        assertTrue(resp.getCategories().containsKey("安全"));
        assertTrue(resp.getCategories().containsKey("服务器"));
        assertTrue(resp.getCategories().containsKey("内容协商"));
        assertTrue(resp.getCategories().containsKey("缓存"));

        List<String> missing = resp.getMissingSecurityHeaders();
        assertTrue(missing.contains("Content-Security-Policy"));
        assertTrue(missing.contains("X-Content-Type-Options"));
        assertTrue(missing.contains("X-Frame-Options"));
        assertTrue(missing.contains("Referrer-Policy"));
        assertFalse(missing.contains("Strict-Transport-Security"));
    }
}