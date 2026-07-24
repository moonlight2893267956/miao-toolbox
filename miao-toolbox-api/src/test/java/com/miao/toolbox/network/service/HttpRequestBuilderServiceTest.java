package com.miao.toolbox.network.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.HttpRequestBuilderRequest;
import com.miao.toolbox.network.dto.HttpRequestBuilderResponse;
import com.miao.toolbox.network.dto.HttpRequestHeader;
import com.miao.toolbox.network.infrastructure.HttpRequestExecutor;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class HttpRequestBuilderServiceTest {

    @Mock
    private HttpRequestExecutor httpRequestExecutor;

    @InjectMocks
    private HttpRequestBuilderService service;

    private HttpRequestBuilderRequest req(String url, String method, String bodyType, String body, Integer timeout) {
        return new HttpRequestBuilderRequest(url, method, List.of(), bodyType, body, timeout);
    }

    @Test
    void shouldRejectBlankUrl() {
        BusinessException ex = assertThrows(BusinessException.class,
            () -> service.execute(req("  ", "GET", null, null, null)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldRejectNonHttpScheme() {
        BusinessException ex = assertThrows(BusinessException.class,
            () -> service.execute(req("ftp://example.com", "GET", null, null, null)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldRejectUnsupportedMethod() {
        BusinessException ex = assertThrows(BusinessException.class,
            () -> service.execute(req("https://example.com", "CONNECT", null, null, null)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldRejectInvalidTimeout() {
        BusinessException ex = assertThrows(BusinessException.class,
            () -> service.execute(req("https://example.com", "GET", null, null, 10)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldRejectUnsupportedBodyType() {
        BusinessException ex = assertThrows(BusinessException.class,
            () -> service.execute(req("https://example.com", "POST", "xml", "<a/>", 15000)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldReturnSuccessWhenExecutorReturns() {
        HttpRequestExecutor.Execution ex = new HttpRequestExecutor.Execution(
            200, "OK", "https://example.com",
            List.of(new HttpRequestExecutor.Header("Content-Type", "application/json")),
            "{\"ok\":true}", 13, false, 326
        );
        when(httpRequestExecutor.send(any(HttpRequestExecutor.Spec.class))).thenReturn(ex);

        HttpRequestBuilderResponse r = service.execute(req("https://example.com", "GET", null, null, 15000));
        assertTrue(r.isSuccess());
        assertEquals(200, r.getStatusCode());
        assertEquals("OK", r.getStatusText());
        assertEquals(326, r.getElapsedMs());
        assertEquals(1, r.getHeaders().size());
        assertEquals("application/json", r.getHeaders().get(0).getValue());
        assertEquals("{\"ok\":true}", r.getBody());
        assertFalse(r.isTruncated());
    }

    @Test
    void shouldMapPostJsonBodyToExecutionSpec() {
        HttpRequestExecutor.Execution ex = new HttpRequestExecutor.Execution(
            201, "Created", "https://example.com", List.of(), "", 0, false, 120
        );
        when(httpRequestExecutor.send(any(HttpRequestExecutor.Spec.class))).thenReturn(ex);

        HttpRequestBuilderResponse r = service.execute(req(
            "https://example.com", "POST", "json", "{\"a\":1}", 15000));
        assertTrue(r.isSuccess());
        assertEquals(201, r.getStatusCode());
    }

    @Test
    void shouldDegradeOnSsrfBlocked() {
        when(httpRequestExecutor.send(any(HttpRequestExecutor.Spec.class)))
            .thenThrow(new BusinessException(ErrorCode.NETWORK_SSRF_BLOCKED, "blocked"));
        HttpRequestBuilderResponse r = service.execute(req("https://169.254.169.254/", "GET", null, null, 15000));
        assertFalse(r.isSuccess());
        assertNotNull(r.getErrorMessage());
        assertTrue(r.getErrorMessage().contains("受保护网段"));
        assertEquals(0, r.getStatusCode());
    }

    @Test
    void shouldDegradeOnTimeout() {
        when(httpRequestExecutor.send(any(HttpRequestExecutor.Spec.class)))
            .thenThrow(new BusinessException(ErrorCode.NETWORK_CONNECTION_TIMEOUT, "timeout"));
        HttpRequestBuilderResponse r = service.execute(req("https://example.com", "GET", null, null, 15000));
        assertFalse(r.isSuccess());
        assertTrue(r.getErrorMessage().contains("超时"));
    }

    @Test
    void shouldCarryCustomHeadersIntoSpec() {
        HttpRequestExecutor.Execution ex = new HttpRequestExecutor.Execution(
            200, "OK", "https://example.com", List.of(), "x", 1, false, 50
        );
        when(httpRequestExecutor.send(any(HttpRequestExecutor.Spec.class))).thenReturn(ex);
        HttpRequestHeader h = HttpRequestHeader.builder().name("X-Test").value("1").build();
        HttpRequestBuilderResponse r = service.execute(
            new HttpRequestBuilderRequest("https://example.com", "GET", List.of(h), null, null, 15000));
        assertTrue(r.isSuccess());
    }
}
