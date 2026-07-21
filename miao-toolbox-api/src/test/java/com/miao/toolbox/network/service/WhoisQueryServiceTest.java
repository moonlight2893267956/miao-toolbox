package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.WhoisField;
import com.miao.toolbox.network.dto.WhoisQueryRequest;
import com.miao.toolbox.network.dto.WhoisQueryResponse;
import com.miao.toolbox.network.infrastructure.WhoisClientWrapper;
import com.miao.toolbox.network.infrastructure.WhoisQueryException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("WhoisQueryService")
class WhoisQueryServiceTest {

    @Mock
    private WhoisClientWrapper whoisClientWrapper;

    @InjectMocks
    private WhoisQueryService whoisQueryService;

    private WhoisQueryResponse stubResult(String text, String server) {
        return WhoisQueryResponse.builder()
                .target("example.com")
                .queryType("DOMAIN")
                .whoisServer(server)
                .fields(List.of())
                .raw(text)
                .found(true)
                .build();
    }

    @Test
    @DisplayName("域名 WHOIS 文本解析出注册商/创建/过期/NS/状态")
    void parseDomainFields() throws Exception {
        String text = """
                Domain Name: EXAMPLE.COM
                Registrar: RESERVED-Internet Assigned Numbers Authority
                Registrar WHOIS Server: whois.iana.org
                Creation Date: 1995-08-14T04:00:00Z
                Registry Expiry Date: 2025-08-13T04:00:00Z
                Updated Date: 2024-08-14T07:01:44Z
                Domain Status: clientDeleteProhibited
                Domain Status: clientTransferProhibited
                Name Server: A.IANA-SERVERS.NET
                Name Server: B.IANA-SERVERS.NET
                """;
        when(whoisClientWrapper.query(anyString(), any(), any())).thenReturn(
                new WhoisClientWrapper.WhoisRawResult(text, "whois.verisign-grs.com"));

        WhoisQueryResponse resp = whoisQueryService.query(req("example.com", null, null));
        assertThat(resp.getQueryType()).isEqualTo("DOMAIN");
        assertThat(resp.getWhoisServer()).isEqualTo("whois.verisign-grs.com");
        assertThat(fieldValue(resp, "注册商")).contains("RESERVED");
        assertThat(fieldValue(resp, "创建时间")).contains("1995-08-14");
        assertThat(fieldValue(resp, "过期时间")).contains("2025-08-13");
        assertThat(fieldValue(resp, "域名状态")).contains("clientDeleteProhibited");
        assertThat(countKey(resp, "域名服务器")).isEqualTo(2);
    }

    @Test
    @DisplayName("IP WHOIS 文本解析出组织/ASN/国家/CIDR")
    void parseIpFields() throws Exception {
        String text = """
                NetRange: 8.8.8.0 - 8.8.8.255
                CIDR: 8.8.8.0/24
                Organization: Google LLC
                OriginAS: AS15169
                Country: US
                """;
        when(whoisClientWrapper.query(anyString(), any(), any())).thenReturn(
                new WhoisClientWrapper.WhoisRawResult(text, "whois.arin.net"));

        WhoisQueryResponse resp = whoisQueryService.query(req("8.8.8.8", null, null));
        assertThat(resp.getQueryType()).isEqualTo("IP");
        assertThat(fieldValue(resp, "组织")).isEqualTo("Google LLC");
        assertThat(fieldValue(resp, "ASN")).isEqualTo("AS15169");
        assertThat(fieldValue(resp, "国家")).isEqualTo("US");
        assertThat(fieldValue(resp, "CIDR")).isEqualTo("8.8.8.0/24");
    }

    @Test
    @DisplayName("下划线域名（如 _dmarc.google.com）应允许查询")
    void underscoreDomainAllowed() throws Exception {
        String text = "Domain Name: _DMARC.GOOGLE.COM\nRegistrar: MarkMonitor Inc.\n";
        when(whoisClientWrapper.query(eq("_dmarc.google.com"), any(), any())).thenReturn(
                new WhoisClientWrapper.WhoisRawResult(text, "whois.markmonitor.com"));
        WhoisQueryResponse resp = whoisQueryService.query(req("_dmarc.google.com", null, null));
        assertThat(resp.getTarget()).isEqualTo("_dmarc.google.com");
        assertThat(fieldValue(resp, "注册商")).contains("MarkMonitor");
    }

    @Test
    @DisplayName("非法域名 → NETWORK_INVALID_INPUT")
    void invalidDomain() {
        assertThatThrownBy(() -> whoisQueryService.query(req("not a domain!", null, null)))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_INVALID_INPUT);
    }

    @Test
    @DisplayName("超范围 timeoutMs → NETWORK_INVALID_INPUT")
    void timeoutOutOfRange() {
        assertThatThrownBy(() -> whoisQueryService.query(req("example.com", null, 60000)))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_INVALID_INPUT);
    }

    @Test
    @DisplayName("WHOIS 查询异常 → NETWORK_CONNECTION_TIMEOUT")
    void queryExceptionMapsToTimeout() throws Exception {
        when(whoisClientWrapper.query(anyString(), any(), any()))
                .thenThrow(new WhoisQueryException(ErrorCode.NETWORK_CONNECTION_TIMEOUT, "WHOIS 查询超时: x"));
        assertThatThrownBy(() -> whoisQueryService.query(req("example.com", null, null)))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_CONNECTION_TIMEOUT);
    }

    @Test
    @DisplayName("自定义 WHOIS 服务器被 SSRF 拦截 → NETWORK_SSRF_BLOCKED")
    void ssrfBlocked() throws Exception {
        when(whoisClientWrapper.query(anyString(), any(), any()))
                .thenThrow(new BusinessException(ErrorCode.NETWORK_SSRF_BLOCKED, "内网", 400));
        assertThatThrownBy(() -> whoisQueryService.query(req("example.com", "10.0.0.1:43", null)))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NETWORK_SSRF_BLOCKED);
    }

    private WhoisQueryRequest req(String target, String server, Integer timeoutMs) {
        WhoisQueryRequest r = new WhoisQueryRequest();
        r.setTarget(target);
        r.setWhoisServer(server);
        r.setTimeoutMs(timeoutMs);
        return r;
    }

    private String fieldValue(WhoisQueryResponse resp, String key) {
        return resp.getFields().stream()
                .filter(f -> f.getKey().equals(key))
                .map(WhoisField::getValue)
                .findFirst().orElse(null);
    }

    private long countKey(WhoisQueryResponse resp, String key) {
        return resp.getFields().stream().filter(f -> f.getKey().equals(key)).count();
    }
}
