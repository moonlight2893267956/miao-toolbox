package com.miao.toolbox.network.infrastructure;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("NetworkTimeoutConfig")
class NetworkTimeoutConfigTest {

    @Test
    @DisplayName("AC5 超时分级")
    void timeouts() {
        assertThat(NetworkTimeoutConfig.TCP_PING.toSeconds()).isEqualTo(5);
        assertThat(NetworkTimeoutConfig.DNS_QUERY.toSeconds()).isEqualTo(10);
        assertThat(NetworkTimeoutConfig.SSL_HANDSHAKE.toSeconds()).isEqualTo(15);
        assertThat(NetworkTimeoutConfig.WHOIS.toSeconds()).isEqualTo(30);
        assertThat(NetworkTimeoutConfig.HTTP_FETCH.toSeconds()).isEqualTo(15);
        assertThat(NetworkTimeoutConfig.WEBSOCKET_IDLE.toSeconds()).isEqualTo(30);
    }
}
