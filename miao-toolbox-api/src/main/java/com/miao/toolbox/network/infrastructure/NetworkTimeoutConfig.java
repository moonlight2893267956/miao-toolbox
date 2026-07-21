package com.miao.toolbox.network.infrastructure;

import java.time.Duration;

/**
 * 网络工具超时策略（按操作类型分级）。
 * 供 NetworkClientFactory 与各工具 Service 统一引用。
 */
public final class NetworkTimeoutConfig {

    private NetworkTimeoutConfig() {}

    /** TCP Ping 单次连接 */
    public static final Duration TCP_PING = Duration.ofSeconds(5);

    /** DNS 查询（含递归） */
    public static final Duration DNS_QUERY = Duration.ofSeconds(10);

    /** SSL/TLS 握手与证书链 */
    public static final Duration SSL_HANDSHAKE = Duration.ofSeconds(15);

    /** WHOIS 查询 */
    public static final Duration WHOIS = Duration.ofSeconds(30);

    /** HTTP fetch（含有限重定向） */
    public static final Duration HTTP_FETCH = Duration.ofSeconds(15);

    /** WebSocket 空闲超时 */
    public static final Duration WEBSOCKET_IDLE = Duration.ofSeconds(30);

    /** 默认出站连接超时（通用） */
    public static final Duration DEFAULT_CONNECT = Duration.ofSeconds(10);

    /** 全局最大并发出站连接数 */
    public static final int MAX_CONCURRENT_CONNECTIONS = 32;
}
