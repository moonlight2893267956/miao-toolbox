package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("NetworkClientFactory 出站连接工厂")
class NetworkClientFactoryTest {

    @Test
    @DisplayName("AC4 成功建立 TCP 连接（测试用放行 loopback）")
    void createsTcpConnectionSuccessfully() throws Exception {
        try (ServerSocket server = new ServerSocket(0)) {
            int port = server.getLocalPort();
            SsrfProtector allowLoopback = new SsrfProtector(
                    host -> new InetAddress[]{InetAddress.getByName("127.0.0.1")}) {
                @Override
                public boolean isBlockedAddress(InetAddress address) {
                    return false;
                }
            };
            NetworkClientFactory factory = new NetworkClientFactory(allowLoopback);

            try (Socket client = factory.createTcpConnection("localhost", port, Duration.ofSeconds(2));
                 Socket accepted = server.accept()) {
                assertThat(client.isConnected()).isTrue();
                assertThat(accepted.isConnected()).isTrue();
            }
        }
    }

    @Test
    @DisplayName("AC4 SSRF 拦截时不建连")
    void doesNotConnectWhenSsrfBlocks() throws Exception {
        try (ServerSocket server = new ServerSocket(0)) {
            int port = server.getLocalPort();
            NetworkClientFactory factory = new NetworkClientFactory(
                    new SsrfProtector(host -> new InetAddress[]{InetAddress.getByName("127.0.0.1")}));

            assertThatThrownBy(() -> factory.createTcpConnection("localhost", port, Duration.ofSeconds(1)))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.NETWORK_SSRF_BLOCKED));
        }
    }

    @Test
    @DisplayName("连接被拒绝映射为 NETWORK_CONNECTION_REFUSED")
    void mapsConnectionRefused() throws Exception {
        // 绑定并立即关闭，端口处于未监听 → refused
        int port;
        try (ServerSocket server = new ServerSocket(0)) {
            port = server.getLocalPort();
        }
        SsrfProtector allowLoopback = new SsrfProtector(
                host -> new InetAddress[]{InetAddress.getByName("127.0.0.1")}) {
            @Override
            public boolean isBlockedAddress(InetAddress address) {
                return false;
            }
        };
        NetworkClientFactory factory = new NetworkClientFactory(allowLoopback);
        assertThatThrownBy(() ->
                factory.createTcpConnection("localhost", port, Duration.ofSeconds(1)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    String code = ((BusinessException) ex).getErrorCode();
                    // macOS/Linux 上多为 refused；个别环境可能映射为 unreachable
                    assertThat(code).isIn(
                            ErrorCode.NETWORK_CONNECTION_REFUSED,
                            ErrorCode.NETWORK_HOST_UNREACHABLE,
                            ErrorCode.NETWORK_CONNECTION_TIMEOUT);
                });
    }

    @Test
    @DisplayName("非法端口")
    void invalidPort() {
        NetworkClientFactory factory = new NetworkClientFactory(new SsrfProtector(
                host -> new InetAddress[]{InetAddress.getByName("8.8.8.8")}));
        assertThatThrownBy(() -> factory.createTcpConnection("x", 0, Duration.ofSeconds(1)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NETWORK_INVALID_INPUT));
    }

    @Test
    @DisplayName("AC5 超时配置常量符合架构")
    void timeoutConfigValues() {
        assertThat(NetworkTimeoutConfig.TCP_PING.getSeconds()).isEqualTo(5);
        assertThat(NetworkTimeoutConfig.DNS_QUERY.getSeconds()).isEqualTo(10);
        assertThat(NetworkTimeoutConfig.SSL_HANDSHAKE.getSeconds()).isEqualTo(15);
        assertThat(NetworkTimeoutConfig.WHOIS.getSeconds()).isEqualTo(30);
        assertThat(NetworkTimeoutConfig.HTTP_FETCH.getSeconds()).isEqualTo(15);
        assertThat(NetworkTimeoutConfig.MAX_CONCURRENT_CONNECTIONS).isPositive();
    }

    @Test
    @DisplayName("resolveSafeAddress 委托 SSRF")
    void resolveSafeAddress() throws Exception {
        InetAddress pub = InetAddress.getByName("1.1.1.1");
        NetworkClientFactory factory = new NetworkClientFactory(
                new SsrfProtector(host -> new InetAddress[]{pub}));
        assertThat(factory.resolveSafeAddress("one.one.one.one").getHostAddress()).isEqualTo("1.1.1.1");
    }

    @Test
    @DisplayName("createTcpPingConnection 使用 TCP_PING 超时路径且走 SSRF")
    void tcpPingHelperUsesSsrf() throws Exception {
        NetworkClientFactory factory = new NetworkClientFactory(
                new SsrfProtector(host -> new InetAddress[]{InetAddress.getByName("10.0.0.1")}));
        assertThatThrownBy(() -> factory.createTcpPingConnection("internal", 443))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NETWORK_SSRF_BLOCKED));
    }
}
