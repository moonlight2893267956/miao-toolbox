package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.PortScanRequest;
import com.miao.toolbox.network.dto.PortScanResponse;
import com.miao.toolbox.network.dto.PortScanResponse.PortScanProbe;
import com.miao.toolbox.network.infrastructure.NetworkClientFactory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("PortScanService")
class PortScanServiceTest {

    @Mock
    private NetworkClientFactory networkClientFactory;

    @InjectMocks
    private PortScanService portScanService;

    private PortScanRequest buildRequest(String host, String portRange) {
        PortScanRequest req = new PortScanRequest();
        req.setHost(host);
        req.setPortRange(portRange);
        req.setConcurrency(5);
        req.setTimeoutMs(1000);
        return req;
    }

    private void mockSuccessfulConnection() throws Exception {
        when(networkClientFactory.resolveSafeAddress(anyString()))
                .thenReturn(InetAddress.getByName("1.2.3.4"));
        Socket mockSocket = mock(Socket.class);
        when(networkClientFactory.createTcpConnection(anyString(), anyInt(), any(Duration.class)))
                .thenReturn(mockSocket);
    }

    @Nested
    @DisplayName("端口范围解析")
    class ParsePortRange {

        @Test
        @DisplayName("common 预设返回常见端口列表")
        void commonPreset() {
            List<Integer> ports = portScanService.parsePortRange("common");
            assertThat(ports).containsExactlyInAnyOrderElementsOf(
                    List.of(21, 22, 23, 25, 53, 80, 110, 111, 135, 139,
                            143, 443, 445, 993, 995, 1433, 1521, 3306,
                            3389, 5432, 5900, 6379, 8080, 8443, 8888, 9090, 27017));
        }

        @Test
        @DisplayName("逗号分隔端口列表")
        void commaSeparated() {
            List<Integer> ports = portScanService.parsePortRange("80,443,8080");
            assertThat(ports).containsExactly(80, 443, 8080);
        }

        @Test
        @DisplayName("端口范围 1-5")
        void portRange() {
            List<Integer> ports = portScanService.parsePortRange("1-5");
            assertThat(ports).containsExactly(1, 2, 3, 4, 5);
        }

        @Test
        @DisplayName("混合格式：逗号+范围")
        void mixedFormat() {
            List<Integer> ports = portScanService.parsePortRange("80,443,1000-1002");
            assertThat(ports).containsExactly(80, 443, 1000, 1001, 1002);
        }

        @Test
        @DisplayName("空表达式返回 common 预设")
        void blankReturnsCommon() {
            List<Integer> ports = portScanService.parsePortRange("");
            assertThat(ports).isNotEmpty();
        }

        @Test
        @DisplayName("无效端口格式抛异常")
        void invalidFormat() {
            assertThatThrownBy(() -> portScanService.parsePortRange("abc"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.NETWORK_INVALID_INPUT);
        }

        @Test
        @DisplayName("端口超出 65535 抛异常")
        void portOutOfRange() {
            assertThatThrownBy(() -> portScanService.parsePortRange("99999"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.NETWORK_INVALID_INPUT);
        }

        @Test
        @DisplayName("范围反转抛异常")
        void reversedRange() {
            assertThatThrownBy(() -> portScanService.parsePortRange("100-50"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.NETWORK_INVALID_INPUT);
        }

        @Test
        @DisplayName("0-999 自动钳位为 1-999")
        void zeroClampedToOne() {
            List<Integer> ports = portScanService.parsePortRange("0-5");
            assertThat(ports).containsExactly(1, 2, 3, 4, 5);
        }
    }

    @Nested
    @DisplayName("扫描逻辑")
    class ScanLogic {

        @Test
        @DisplayName("全部端口开放")
        void allOpen() throws Exception {
            mockSuccessfulConnection();
            PortScanRequest req = buildRequest("example.com", "80,443");
            PortScanResponse resp = portScanService.scan(req);
            assertThat(resp.getOpenCount()).isEqualTo(2);
            assertThat(resp.getClosedCount()).isEqualTo(0);
            assertThat(resp.getProbes()).hasSize(2);
            assertThat(resp.getProbes()).allMatch(PortScanProbe::isOpen);
            assertThat(resp.getResolvedIp()).isEqualTo("1.2.3.4");
        }

        @Test
        @DisplayName("全部端口关闭")
        void allClosed() throws Exception {
            when(networkClientFactory.resolveSafeAddress("dead.example"))
                    .thenReturn(InetAddress.getByName("1.2.3.4"));
            when(networkClientFactory.createTcpConnection(anyString(), anyInt(), any(Duration.class)))
                    .thenThrow(new BusinessException(ErrorCode.NETWORK_CONNECTION_REFUSED, "连接被拒绝", 504));

            PortScanRequest req = buildRequest("dead.example", "80,443");
            PortScanResponse resp = portScanService.scan(req);
            assertThat(resp.getOpenCount()).isEqualTo(0);
            assertThat(resp.getClosedCount()).isEqualTo(2);
            assertThat(resp.getProbes()).allMatch(p -> !p.isOpen());
        }

        @Test
        @DisplayName("SSRF 拦截：全部端口标记失败")
        void ssrfBlocked() {
            when(networkClientFactory.resolveSafeAddress("10.0.0.1"))
                    .thenThrow(new BusinessException(ErrorCode.NETWORK_SSRF_BLOCKED, "SSRF", 400));

            PortScanRequest req = buildRequest("10.0.0.1", "80,443");
            PortScanResponse resp = portScanService.scan(req);
            assertThat(resp.getOpenCount()).isEqualTo(0);
            assertThat(resp.getClosedCount()).isEqualTo(2);
            assertThat(resp.getProbes()).allMatch(p ->
                    ErrorCode.NETWORK_SSRF_BLOCKED.equals(p.getErrorCode()));
            verify(networkClientFactory, never())
                    .createTcpConnection(anyString(), anyInt(), any(Duration.class));
        }

        @Test
        @DisplayName("服务识别：开放端口返回服务名")
        void serviceIdentification() throws Exception {
            mockSuccessfulConnection();
            PortScanRequest req = buildRequest("example.com", "22,80,3306");
            PortScanResponse resp = portScanService.scan(req);
            assertThat(resp.getProbes()).hasSize(3);
            assertThat(resp.getProbes().stream().filter(p -> p.getPort() == 22).findFirst().get().getService())
                    .isEqualTo("SSH");
            assertThat(resp.getProbes().stream().filter(p -> p.getPort() == 80).findFirst().get().getService())
                    .isEqualTo("HTTP");
            assertThat(resp.getProbes().stream().filter(p -> p.getPort() == 3306).findFirst().get().getService())
                    .isEqualTo("MySQL");
        }

        @Test
        @DisplayName("流式回调按端口推送")
        void streamingCallbacks() throws Exception {
            mockSuccessfulConnection();
            PortScanRequest req = buildRequest("example.com", "80,443,8080");
            List<Integer> scannedPorts = new ArrayList<>();
            PortScanResponse resp = portScanService.scanStreaming(req, p -> scannedPorts.add(p.getPort()));
            assertThat(scannedPorts).hasSize(3);
            assertThat(scannedPorts).containsExactlyInAnyOrder(80, 443, 8080);
            assertThat(resp.getTotalPorts()).isEqualTo(3);
        }

        @Test
        @DisplayName("耗时统计")
        void elapsedMs() throws Exception {
            mockSuccessfulConnection();
            PortScanRequest req = buildRequest("example.com", "80");
            PortScanResponse resp = portScanService.scan(req);
            assertThat(resp.getElapsedMs()).isGreaterThanOrEqualTo(0);
        }
    }
}
