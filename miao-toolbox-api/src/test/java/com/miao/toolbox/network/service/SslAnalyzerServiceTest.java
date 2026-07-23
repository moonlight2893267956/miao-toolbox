package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.SslAnalyzerRequest;
import com.miao.toolbox.network.dto.SslAnalyzerResponse;
import com.miao.toolbox.network.infrastructure.SslAnalyzerClient;
import com.miao.toolbox.network.infrastructure.SslAnalyzerException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SslAnalyzerServiceTest {

    @Mock
    private SslAnalyzerClient sslAnalyzerClient;

    @InjectMocks
    private SslAnalyzerService service;

    private SslAnalyzerRequest req(String host, Integer port, Integer timeoutMs) {
        SslAnalyzerRequest r = new SslAnalyzerRequest();
        r.setHost(host);
        r.setPort(port);
        r.setTimeoutMs(timeoutMs);
        return r;
    }

    private SslAnalyzerClient.SslAnalysisResult sampleResult() {
        return new SslAnalyzerClient.SslAnalysisResult(
                "TLSv1.3", "TLS_AES_256_GCM_SHA384", true, null,
                List.of(), "93.184.216.34", 120L);
    }

    @Test
    void success() throws Exception {
        when(sslAnalyzerClient.analyze(anyString(), anyInt(), any())).thenReturn(sampleResult());
        SslAnalyzerResponse resp = service.analyze(req("example.com", 443, 15000));
        assertTrue(resp.isSuccess());
        assertEquals("TLSv1.3", resp.getProtocol());
        assertEquals("93.184.216.34", resp.getResolvedIp());
        assertTrue(resp.isPeerVerified());
        assertNotNull(resp.getErrorMessage() == null ? "" : null); // 无 errorMessage
        assertEquals(null, resp.getErrorMessage());
    }

    @Test
    void invalidInput_hostBlank() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.analyze(req("", 443, 15000)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void invalidInput_portRange() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.analyze(req("example.com", 70000, 15000)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void invalidInput_timeoutRange() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.analyze(req("example.com", 443, 10)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void ssrfBlockedGraceful() throws Exception {
        when(sslAnalyzerClient.analyze(anyString(), anyInt(), any()))
                .thenThrow(new BusinessException(ErrorCode.NETWORK_SSRF_BLOCKED, "SSRF 拦截"));
        SslAnalyzerResponse resp = service.analyze(req("169.254.169.254", 443, 15000));
        assertTrue(resp.isSuccess(), "graceful response should mark success=true");
        assertNotNull(resp.getErrorMessage());
        assertTrue(resp.getErrorMessage().contains("不允许访问"), resp.getErrorMessage());
    }

    @Test
    void dnsFailureGraceful() throws Exception {
        when(sslAnalyzerClient.analyze(anyString(), anyInt(), any()))
                .thenThrow(new BusinessException(ErrorCode.NETWORK_DNS_RESOLVE_FAILED,
                        "无法解析主机: ss.example.com，请检查域名是否正确"));
        SslAnalyzerResponse resp = service.analyze(req("ss.example.com", 443, 15000));
        assertTrue(resp.isSuccess());
        assertNotNull(resp.getErrorMessage());
        assertTrue(resp.getErrorMessage().contains("无法解析该域名"), resp.getErrorMessage());
    }

    @Test
    void timeoutGraceful() throws Exception {
        when(sslAnalyzerClient.analyze(anyString(), anyInt(), any()))
                .thenThrow(new SslAnalyzerException(ErrorCode.NETWORK_CONNECTION_TIMEOUT,
                        "SSL 连接超时: example.com:443"));
        SslAnalyzerResponse resp = service.analyze(req("example.com", 443, 15000));
        assertTrue(resp.isSuccess());
        assertNotNull(resp.getErrorMessage());
        assertTrue(resp.getErrorMessage().contains("SSL 连接超时"), resp.getErrorMessage());
    }

    @Test
    void connectionRefusedGraceful() throws Exception {
        when(sslAnalyzerClient.analyze(anyString(), anyInt(), any()))
                .thenThrow(new SslAnalyzerException(ErrorCode.NETWORK_CONNECTION_REFUSED,
                        "SSL 连接失败: example.com:443 (refused)"));
        SslAnalyzerResponse resp = service.analyze(req("example.com", 443, 15000));
        assertTrue(resp.isSuccess());
        assertNotNull(resp.getErrorMessage());
        assertTrue(resp.getErrorMessage().contains("SSL 连接被拒绝"), resp.getErrorMessage());
    }

    @Test
    void handshakeFailedGraceful() throws Exception {
        when(sslAnalyzerClient.analyze(anyString(), anyInt(), any()))
                .thenThrow(new SslAnalyzerException(ErrorCode.NETWORK_SSL_HANDSHAKE_FAILED,
                        "SSL 握手失败: plain http"));
        SslAnalyzerResponse resp = service.analyze(req("example.com", 443, 15000));
        assertTrue(resp.isSuccess());
        assertNotNull(resp.getErrorMessage());
        assertTrue(resp.getErrorMessage().contains("SSL 握手失败"), resp.getErrorMessage());
    }
}