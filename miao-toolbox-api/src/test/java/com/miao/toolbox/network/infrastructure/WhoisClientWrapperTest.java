package com.miao.toolbox.network.infrastructure;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("WhoisClientWrapper（纯函数，不依赖网络）")
class WhoisClientWrapperTest {

    @Test
    @DisplayName("从 IANA 响应解析权威 WHOIS 服务器")
    void extractIanaServer() {
        String iana = """
                1.0.0.0 - 9.255.255.255 (JPNIC block)\n
                Domain: COM\n
                WHOIS Server: whois.verisign-grs.com (可喜)\n
                """;
        WhoisClientWrapper wrapper = new WhoisClientWrapper(new SsrfProtector());
        assertThat(wrapper.extractWhoisServer(iana)).isEqualTo("whois.verisign-grs.com");
    }

    @Test
    @DisplayName("从 ARIN 响应解析 ReferralServer")
    void extractReferralServer() {
        String arin = """
                NetRange: 8.8.8.0 - 8.8.8.255
                ReferralServer:  whois://whois.ripe.net
                """;
        WhoisClientWrapper wrapper = new WhoisClientWrapper(new SsrfProtector());
        assertThat(wrapper.extractWhoisServer(arin)).isEqualTo("whois.ripe.net");
    }

    @Test
    @DisplayName("规范化 host：去掉 scheme / 端口 / 引号 / 尾点")
    void normalizeHost() {
        assertThat(WhoisClientWrapper.normalizeHost("whois://whois.ripe.net:43")).isEqualTo("whois.ripe.net");
        assertThat(WhoisClientWrapper.normalizeHost("WHOIS.RIPE.NET.")).isEqualTo("whois.ripe.net");
        assertThat(WhoisClientWrapper.normalizeHost("\"whois.example.com\"")).isEqualTo("whois.example.com");
    }

    @Test
    @DisplayName("IP 判定")
    void isIp() {
        assertThat(WhoisClientWrapper.isIp("8.8.8.8")).isTrue();
        assertThat(WhoisClientWrapper.isIp("2001:db8::1")).isTrue();
        assertThat(WhoisClientWrapper.isIp("example.com")).isFalse();
        assertThat(WhoisClientWrapper.isIp("256.1.1.1")).isFalse();
        assertThat(WhoisClientWrapper.isIp("not a domain")).isFalse();
    }
}
