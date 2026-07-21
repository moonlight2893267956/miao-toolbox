package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.TcpPingRequest;
import com.miao.toolbox.network.dto.TcpPingResponse;
import com.miao.toolbox.network.infrastructure.NetworkClientFactory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.InetAddress;
import java.net.Socket;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TcpPingService")
class TcpPingServiceTest {

    @Mock
    private NetworkClientFactory networkClientFactory;

    @InjectMocks
    private TcpPingService tcpPingService;

    @Test
    @DisplayName("默认 4 次探测均成功")
    void fourSuccessfulProbes() throws Exception {
        when(networkClientFactory.resolveSafeAddress("example.com"))
                .thenReturn(InetAddress.getByName("8.8.8.8"));
        Socket mockSocket = mock(Socket.class);
        when(networkClientFactory.createTcpConnection(eq("example.com"), eq(443), any(Duration.class)))
                .thenReturn(mockSocket);

        TcpPingRequest req = new TcpPingRequest();
        req.setHost("example.com");
        req.setPort(443);
        req.setCount(4);

        TcpPingResponse resp = tcpPingService.ping(req);
        assertThat(resp.getCount()).isEqualTo(4);
        assertThat(resp.getSuccessCount()).isEqualTo(4);
        assertThat(resp.getFailCount()).isEqualTo(0);
        assertThat(resp.getProbes()).hasSize(4);
        assertThat(resp.getAvgLatencyMs()).isNotNull();
        verify(mockSocket, times(4)).close();
    }

    @Test
    @DisplayName("自定义端口 8080")
    void customPort() throws Exception {
        when(networkClientFactory.resolveSafeAddress("h")).thenReturn(InetAddress.getByName("1.1.1.1"));
        Socket mockSocket = mock(Socket.class);
        when(networkClientFactory.createTcpConnection(eq("h"), eq(8080), any(Duration.class)))
                .thenReturn(mockSocket);

        TcpPingRequest req = new TcpPingRequest();
        req.setHost("h");
        req.setPort(8080);
        req.setCount(2);

        TcpPingResponse resp = tcpPingService.ping(req);
        assertThat(resp.getPort()).isEqualTo(8080);
        assertThat(resp.getSuccessCount()).isEqualTo(2);
        verify(networkClientFactory, times(2))
                .createTcpConnection(eq("h"), eq(8080), any(Duration.class));
    }

    @Test
    @DisplayName("超时错误码透传")
    void timeoutMapped() throws Exception {
        when(networkClientFactory.resolveSafeAddress("dead.example"))
                .thenReturn(InetAddress.getByName("1.2.3.4"));
        when(networkClientFactory.createTcpConnection(anyString(), anyInt(), any(Duration.class)))
                .thenThrow(new BusinessException(ErrorCode.NETWORK_CONNECTION_TIMEOUT, "连接超时", 504));

        TcpPingRequest req = new TcpPingRequest();
        req.setHost("dead.example");
        req.setCount(3);

        TcpPingResponse resp = tcpPingService.ping(req);
        assertThat(resp.getSuccessCount()).isEqualTo(0);
        assertThat(resp.getFailCount()).isEqualTo(3);
        assertThat(resp.getProbes()).allMatch(p ->
                ErrorCode.NETWORK_CONNECTION_TIMEOUT.equals(p.getErrorCode()));
    }

    @Test
    @DisplayName("SSRF 拦截：每次 probe 失败")
    void ssrfBlocked() {
        when(networkClientFactory.resolveSafeAddress("10.0.0.1"))
                .thenThrow(new BusinessException(ErrorCode.NETWORK_SSRF_BLOCKED, "SSRF", 400));

        TcpPingRequest req = new TcpPingRequest();
        req.setHost("10.0.0.1");
        req.setCount(2);

        TcpPingResponse resp = tcpPingService.ping(req);
        assertThat(resp.getFailCount()).isEqualTo(2);
        assertThat(resp.getProbes()).allMatch(p ->
                ErrorCode.NETWORK_SSRF_BLOCKED.equals(p.getErrorCode()));
        verify(networkClientFactory, never())
                .createTcpConnection(anyString(), anyInt(), any(Duration.class));
    }

    @Test
    @DisplayName("流式回调按序推送")
    void streamingCallbacks() throws Exception {
        when(networkClientFactory.resolveSafeAddress("h")).thenReturn(InetAddress.getByName("1.1.1.1"));
        Socket mockSocket = mock(Socket.class);
        when(networkClientFactory.createTcpConnection(anyString(), anyInt(), any(Duration.class)))
                .thenReturn(mockSocket);

        TcpPingRequest req = new TcpPingRequest();
        req.setHost("h");
        req.setCount(5);
        req.setIntervalMs(0);

        List<Integer> seqs = new ArrayList<>();
        TcpPingResponse resp = tcpPingService.pingStreaming(req, p -> seqs.add(p.getSeq()));
        assertThat(seqs).containsExactly(1, 2, 3, 4, 5);
        assertThat(resp.getCount()).isEqualTo(5);
    }

    @Test
    @DisplayName("连续模式按 intervalMs 间隔逐条推送")
    void streamingIntervalApplied() throws Exception {
        when(networkClientFactory.resolveSafeAddress("h")).thenReturn(InetAddress.getByName("1.1.1.1"));
        Socket mockSocket = mock(Socket.class);
        when(networkClientFactory.createTcpConnection(anyString(), anyInt(), any(Duration.class)))
                .thenReturn(mockSocket);

        TcpPingRequest req = new TcpPingRequest();
        req.setHost("h");
        req.setCount(3);
        req.setIntervalMs(150);

        long start = System.currentTimeMillis();
        tcpPingService.pingStreaming(req, p -> { });
        long elapsed = System.currentTimeMillis() - start;
        // 3 次探测应有 2 次间隔（150ms × 2 = 300ms），留余量断言
        assertThat(elapsed).isGreaterThan(200L);
    }
}
