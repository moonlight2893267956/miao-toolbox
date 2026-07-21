package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.DnsQueryRequest;
import com.miao.toolbox.network.dto.DnsQueryResponse;
import com.miao.toolbox.network.dto.DnsRecord;
import com.miao.toolbox.network.infrastructure.DnsClientWrapper;
import com.miao.toolbox.network.infrastructure.DnsResolveException;
import com.miao.toolbox.network.infrastructure.NetworkClientFactory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("DnsQueryService")
class DnsQueryServiceTest {

    @Mock
    private NetworkClientFactory networkClientFactory;

    @Mock
    private DnsClientWrapper dnsClientWrapper;

    @InjectMocks
    private DnsQueryService dnsQueryService;

    @Test
    @DisplayName("默认查询 A/AAAA，使用系统解析器")
    void defaultTypesUseSystemResolver() throws Exception {
        DnsRecord rec = DnsRecord.builder().name("example.com.").type("A").ttl(300L).value("1.2.3.4").build();
        when(dnsClientWrapper.query(any(), any(), any(), any(Duration.class))).thenReturn(List.of(rec));

        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("example.com");

        DnsQueryResponse resp = dnsQueryService.query(req);
        assertThat(resp.getQueryTypes()).containsExactly("A", "AAAA");
        assertThat(resp.getDnsServer()).isEqualTo("system-default");
        assertThat(resp.getTotal()).isEqualTo(1);
        assertThat(resp.getRecords()).containsExactly(rec);
        // 未指定 dnsServer 不应触发 SSRF 校验
        org.mockito.Mockito.verify(networkClientFactory, org.mockito.Mockito.never())
                .resolveSafeAddress(any());
    }

    @Test
    @DisplayName("自定义 DNS 服务器经 SSRF 校验，标签为 地址:端口")
    void customDnsServerSsrfChecked() throws Exception {
        when(networkClientFactory.resolveSafeAddress("8.8.8.8")).thenReturn(InetAddress.getByName("8.8.8.8"));
        when(dnsClientWrapper.query(any(), any(), any(), any(Duration.class))).thenReturn(List.of());

        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("example.com");
        req.setTypes(List.of("TXT"));
        req.setDnsServer("8.8.8.8:53");

        DnsQueryResponse resp = dnsQueryService.query(req);
        assertThat(resp.getDnsServer()).isEqualTo("8.8.8.8:53");
        assertThat(resp.getQueryTypes()).containsExactly("TXT");
    }

    @Test
    @DisplayName("不支持的记录类型 → NETWORK_INVALID_INPUT")
    void unsupportedType() {
        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("example.com");
        req.setTypes(List.of("A", "BOGUS"));

        assertThatThrownBy(() -> dnsQueryService.query(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_INVALID_INPUT);
    }

    @Test
    @DisplayName("超时范围越界 → NETWORK_INVALID_INPUT")
    void timeoutOutOfRange() {
        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("example.com");
        req.setTimeoutMs(500);

        assertThatThrownBy(() -> dnsQueryService.query(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_INVALID_INPUT);
    }

    @Test
    @DisplayName("非法域名 → NETWORK_INVALID_INPUT")
    void invalidDomain() {
        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("not a domain!");

        assertThatThrownBy(() -> dnsQueryService.query(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_INVALID_INPUT);
    }

    @Test
    @DisplayName("下划线开头的域名（如 _dnsauth.btts）应允许查询")
    void underscoreDomainAllowed() throws Exception {
        when(dnsClientWrapper.query(eq("_dnsauth.btts"), any(), any(), any(Duration.class)))
                .thenReturn(List.of(
                        DnsRecord.builder().name("_dnsauth.btts").type("TXT").ttl(300L).value("v=verify1").build()
                ));

        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("_dnsauth.btts");
        req.setTypes(List.of("TXT"));

        DnsQueryResponse resp = dnsQueryService.query(req);
        assertThat(resp.getRecords()).hasSize(1);
        assertThat(resp.getRecords().get(0).getValue()).isEqualTo("v=verify1");
    }

    @Test
    @DisplayName("自定义 DNS 服务器命中 SSRF → 透传 NETWORK_SSRF_BLOCKED")
    void ssrfBlocked() {
        when(networkClientFactory.resolveSafeAddress("10.0.0.1"))
                .thenThrow(new BusinessException(ErrorCode.NETWORK_SSRF_BLOCKED, "SSRF", 400));

        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("example.com");
        req.setDnsServer("10.0.0.1");

        assertThatThrownBy(() -> dnsQueryService.query(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_SSRF_BLOCKED);
    }

    @Test
    @DisplayName("解析失败（域名不存在）→ NETWORK_DNS_RESOLVE_FAILED")
    void resolveFailed() throws Exception {
        when(dnsClientWrapper.query(any(), any(), any(), any(Duration.class)))
                .thenThrow(new DnsResolveException("域名不存在或无法解析：nope.invalid"));

        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("nope.invalid");

        assertThatThrownBy(() -> dnsQueryService.query(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_DNS_RESOLVE_FAILED);
    }

    @Test
    @DisplayName("底层 IO 异常 → NETWORK_CONNECTION_TIMEOUT")
    void ioTimeout() throws Exception {
        when(dnsClientWrapper.query(any(), any(), any(), any(Duration.class)))
                .thenThrow(new java.io.IOException("timed out"));

        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("example.com");

        assertThatThrownBy(() -> dnsQueryService.query(req))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_CONNECTION_TIMEOUT);
    }
}
