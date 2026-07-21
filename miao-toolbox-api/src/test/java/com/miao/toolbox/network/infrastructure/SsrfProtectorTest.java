package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.net.InetAddress;
import java.net.UnknownHostException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("SsrfProtector SSRF 防护")
class SsrfProtectorTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "127.0.0.1",
            "10.0.0.1",
            "172.16.0.1",
            "172.31.255.1",
            "192.168.1.1",
            "0.0.0.0",
            "169.254.169.254",
            "::1"
    })
    @DisplayName("AC1 内网/环回/链路本地 IP 被拦截")
    void blocksPrivateAndLoopbackIps(String ip) throws Exception {
        InetAddress addr = InetAddress.getByName(ip);
        SsrfProtector protector = new SsrfProtector(host -> new InetAddress[]{addr});

        assertThat(protector.isBlockedAddress(addr)).isTrue();
        assertThatThrownBy(() -> protector.resolveAndValidate(ip))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.NETWORK_SSRF_BLOCKED);
                    assertThat(be.getHttpStatus()).isEqualTo(400);
                });
    }

    @Test
    @DisplayName("AC2 DNS 重绑定：解析到 127.0.0.1 被拦截")
    void blocksDnsRebindingToLoopback() throws Exception {
        InetAddress loopback = InetAddress.getByName("127.0.0.1");
        SsrfProtector protector = new SsrfProtector(host -> {
            if ("evil.com".equals(host)) {
                return new InetAddress[]{loopback};
            }
            throw new UnknownHostException(host);
        });

        assertThatThrownBy(() -> protector.resolveAndValidate("evil.com"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NETWORK_SSRF_BLOCKED));
    }

    @Test
    @DisplayName("AC2 部分解析结果为内网时整体拒绝")
    void blocksWhenAnyResolvedIpIsPrivate() throws Exception {
        InetAddress pub = InetAddress.getByName("8.8.8.8");
        InetAddress priv = InetAddress.getByName("10.1.1.1");
        SsrfProtector protector = new SsrfProtector(
                host -> new InetAddress[]{pub, priv});

        assertThatThrownBy(() -> protector.resolveAndValidate("mixed.example"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NETWORK_SSRF_BLOCKED));
    }

    @Test
    @DisplayName("AC3 公网 IP 通过校验")
    void allowsPublicIp() throws Exception {
        InetAddress pub = InetAddress.getByName("8.8.8.8");
        SsrfProtector protector = new SsrfProtector(host -> new InetAddress[]{pub});

        InetAddress result = protector.resolveAndValidate("dns.google");
        assertThat(result.getHostAddress()).isEqualTo("8.8.8.8");
        assertThat(protector.isBlockedAddress(pub)).isFalse();
    }

    @Test
    @DisplayName("无效主机名抛 NETWORK_INVALID_INPUT")
    void rejectsInvalidHost() {
        SsrfProtector protector = new SsrfProtector();
        assertThatThrownBy(() -> protector.resolveAndValidate("https://evil.com/x"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NETWORK_INVALID_INPUT));
        assertThatThrownBy(() -> protector.resolveAndValidate(" "))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NETWORK_INVALID_INPUT));
    }

    @Test
    @DisplayName("DNS 解析失败抛 NETWORK_DNS_RESOLVE_FAILED")
    void dnsFailure() {
        SsrfProtector protector = new SsrfProtector(host -> {
            throw new UnknownHostException(host);
        });
        assertThatThrownBy(() -> protector.resolveAndValidate("no-such-host.invalid"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NETWORK_DNS_RESOLVE_FAILED));
    }

    @Test
    @DisplayName("normalizeHost 剥离 host:port")
    void stripsPort() {
        assertThat(SsrfProtector.normalizeHost("example.com:443")).isEqualTo("example.com");
    }
}
