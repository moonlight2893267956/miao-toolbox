package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * SSRF 防护：内网/环回/链路本地黑名单 + DNS 解析后二次校验（防重绑定）。
 * <p>
 * 所有服务端出站代理工具必须经本类校验后再连接，禁止直接 new Socket(userHost, port)。
 */
public class SsrfProtector {

    private static final Logger log = LoggerFactory.getLogger(SsrfProtector.class);

    private final HostResolver hostResolver;

    public SsrfProtector(HostResolver hostResolver) {
        this.hostResolver = Objects.requireNonNull(hostResolver, "hostResolver");
    }

    public SsrfProtector() {
        this(HostResolver.jdk());
    }

    /**
     * 解析主机并校验所有解析结果均非黑名单地址。
     *
     * @param host 主机名或 IP 字面量（禁止带协议/路径）
     * @return 第一个可用的公网地址（用于后续连接）
     */
    public InetAddress resolveAndValidate(String host) {
        String normalized = normalizeHost(host);
        try {
            InetAddress[] addresses = hostResolver.resolve(normalized);
            if (addresses == null || addresses.length == 0) {
                throw dnsFailed(normalized);
            }
            List<String> blocked = new ArrayList<>();
            InetAddress firstSafe = null;
            for (InetAddress addr : addresses) {
                if (isBlockedAddress(addr)) {
                    blocked.add(addr.getHostAddress());
                    continue;
                }
                if (firstSafe == null) {
                    firstSafe = addr;
                }
            }
            if (firstSafe == null) {
                log.warn("SSRF blocked host={} resolvedToBlocked={}", normalized, blocked);
                throw ssrfBlocked("目标地址不可访问（解析结果落在受保护网段）");
            }
            if (!blocked.isEmpty()) {
                // 部分解析结果为内网：视为重绑定风险，整体拒绝更安全
                log.warn("SSRF partial-block host={} safe={} blocked={}",
                        normalized, firstSafe.getHostAddress(), blocked);
                throw ssrfBlocked("目标地址不可访问（存在内网解析结果，疑似 DNS 重绑定）");
            }
            return firstSafe;
        } catch (UnknownHostException e) {
            throw dnsFailed(normalized);
        }
    }

    /**
     * 仅校验已解析的 IP（连接前/连接后二次校验可用）。
     */
    public void validateAddress(InetAddress address) {
        if (address == null || isBlockedAddress(address)) {
            throw ssrfBlocked("目标地址不可访问（受保护网段）");
        }
    }

    /**
     * 是否为禁止出站的地址。
     */
    public boolean isBlockedAddress(InetAddress address) {
        if (address == null) {
            return true;
        }
        // 任意/未指定
        if (address.isAnyLocalAddress()) {
            return true;
        }
        // 环回 127.0.0.0/8、::1
        if (address.isLoopbackAddress()) {
            return true;
        }
        // 链路本地 169.254.0.0/16、fe80::/10（含云 metadata 169.254.169.254）
        if (address.isLinkLocalAddress()) {
            return true;
        }
        // 组播
        if (address.isMulticastAddress()) {
            return true;
        }
        // Site-local 旧标记 + 私有网段
        if (address.isSiteLocalAddress()) {
            return true;
        }
        if (address instanceof Inet4Address v4) {
            return isBlockedIpv4(v4.getAddress());
        }
        if (address instanceof Inet6Address v6) {
            return isBlockedIpv6(v6);
        }
        return false;
    }

    private static boolean isBlockedIpv4(byte[] b) {
        int a = b[0] & 0xff;
        int b1 = b[1] & 0xff;
        // 0.0.0.0/8
        if (a == 0) {
            return true;
        }
        // 10.0.0.0/8
        if (a == 10) {
            return true;
        }
        // 127.0.0.0/8（loopback 已覆盖，双保险）
        if (a == 127) {
            return true;
        }
        // 169.254.0.0/16
        if (a == 169 && b1 == 254) {
            return true;
        }
        // 172.16.0.0/12
        if (a == 172 && b1 >= 16 && b1 <= 31) {
            return true;
        }
        // 192.168.0.0/16
        if (a == 192 && b1 == 168) {
            return true;
        }
        // 100.64.0.0/10（CGNAT，可选拦截）
        if (a == 100 && b1 >= 64 && b1 <= 127) {
            return true;
        }
        return false;
    }

    private static boolean isBlockedIpv6(Inet6Address v6) {
        // unique local fc00::/7
        byte[] b = v6.getAddress();
        if ((b[0] & 0xfe) == 0xfc) {
            return true;
        }
        // IPv4-mapped :ffff:x.x.x.x → 按 IPv4 规则
        if (v6.isIPv4CompatibleAddress() || isIpv4Mapped(b)) {
            byte[] v4 = new byte[]{b[12], b[13], b[14], b[15]};
            return isBlockedIpv4(v4);
        }
        return false;
    }

    private static boolean isIpv4Mapped(byte[] b) {
        if (b.length != 16) {
            return false;
        }
        for (int i = 0; i < 10; i++) {
            if (b[i] != 0) {
                return false;
            }
        }
        return (b[10] & 0xff) == 0xff && (b[11] & 0xff) == 0xff;
    }

    static String normalizeHost(String host) {
        if (host == null || host.isBlank()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "主机名不能为空", 400);
        }
        String h = host.trim();
        // 去掉用户可能误传的 scheme / path / port
        if (h.contains("://")) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "请输入主机名或 IP，不要包含协议", 400);
        }
        if (h.contains("/") || h.contains("?") || h.contains("#") || h.contains(" ")) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "主机名格式无效", 400);
        }
        // [ipv6]:port or host:port → 去掉端口（IPv6 字面量保留括号内）
        if (h.startsWith("[")) {
            int end = h.indexOf(']');
            if (end > 0) {
                h = h.substring(1, end);
            }
        } else {
            // 仅当像 host:port 且不是纯 IPv6 时剥端口
            int colon = h.lastIndexOf(':');
            if (colon > 0 && h.indexOf(':') == colon) {
                String maybePort = h.substring(colon + 1);
                if (maybePort.matches("\\d{1,5}")) {
                    h = h.substring(0, colon);
                }
            }
        }
        if (h.isBlank()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "主机名不能为空", 400);
        }
        return h.toLowerCase(Locale.ROOT);
    }

    private static BusinessException ssrfBlocked(String message) {
        return new BusinessException(ErrorCode.NETWORK_SSRF_BLOCKED, message, 400);
    }

    private static BusinessException dnsFailed(String host) {
        return new BusinessException(
                ErrorCode.NETWORK_DNS_RESOLVE_FAILED,
                "无法解析主机: " + host,
                502);
    }
}
