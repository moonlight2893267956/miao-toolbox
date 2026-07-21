package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.DnsQueryRequest;
import com.miao.toolbox.network.dto.DnsQueryResponse;
import com.miao.toolbox.network.dto.DnsRecord;
import com.miao.toolbox.network.infrastructure.DnsClientWrapper;
import com.miao.toolbox.network.infrastructure.DnsResolveException;
import com.miao.toolbox.network.infrastructure.NetworkClientFactory;
import com.miao.toolbox.network.infrastructure.NetworkTimeoutConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.xbill.DNS.Type;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * DNS 查询业务：校验域名与记录类型、SSRF 校验自定义 DNS 服务器、调用底层解析封装。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DnsQueryService {

    private final NetworkClientFactory networkClientFactory;
    private final DnsClientWrapper dnsClientWrapper;

    static final List<String> SUPPORTED_TYPES =
            List.of("A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR");

    public DnsQueryResponse query(DnsQueryRequest request) {
        String domain = request.getDomain().trim();
        validateDomain(domain);

        List<String> rawTypes = (request.getTypes() == null || request.getTypes().isEmpty())
                ? List.of("A", "AAAA")
                : request.getTypes();
        List<Integer> typeCodes = new ArrayList<>();
        List<String> usedTypes = new ArrayList<>();
        for (String t : rawTypes) {
            String up = t.trim().toUpperCase();
            if (!SUPPORTED_TYPES.contains(up)) {
                throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "不支持的 DNS 记录类型：" + t);
            }
            typeCodes.add(Type.value(up));
            usedTypes.add(up);
        }

        int timeoutMs = (request.getTimeoutMs() != null)
                ? request.getTimeoutMs()
                : (int) NetworkTimeoutConfig.DNS_QUERY.toMillis();
        if (timeoutMs < 1000 || timeoutMs > 30000) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "超时需在 1000–30000ms 之间");
        }
        Duration timeout = Duration.ofMillis(timeoutMs);

        // SSRF 校验自定义 DNS 服务器（仅当显式指定时）
        InetSocketAddress resolverSocket = null;
        String dnsServerLabel;
        if (request.getDnsServer() != null && !request.getDnsServer().isBlank()) {
            String raw = request.getDnsServer().trim();
            String hostPart = raw;
            int port = DnsClientWrapper.defaultPort();
            int colon = raw.lastIndexOf(':');
            // 简单区分 IPv6 与 host:port：IPv6 含多个冒号
            if (colon > 0 && raw.chars().filter(c -> c == ':').count() <= 1) {
                hostPart = raw.substring(0, colon);
                try {
                    port = Integer.parseInt(raw.substring(colon + 1).trim());
                } catch (NumberFormatException e) {
                    throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "DNS 服务器端口非法");
                }
            }
            InetAddress safe = networkClientFactory.resolveSafeAddress(hostPart);
            resolverSocket = new InetSocketAddress(safe, port);
            dnsServerLabel = safe.getHostAddress() + ":" + port;
        } else {
            dnsServerLabel = "system-default";
        }

        List<DnsRecord> records;
        try {
            records = dnsClientWrapper.query(domain, typeCodes, resolverSocket, timeout);
        } catch (DnsResolveException e) {
            throw new BusinessException(ErrorCode.NETWORK_DNS_RESOLVE_FAILED, e.getMessage());
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.NETWORK_CONNECTION_TIMEOUT, "DNS 解析失败：" + e.getMessage());
        }

        return DnsQueryResponse.builder()
                .domain(domain)
                .queryTypes(usedTypes)
                .dnsServer(dnsServerLabel)
                .records(records)
                .total(records.size())
                .build();
    }

    private void validateDomain(String domain) {
        if (domain.isEmpty() || domain.length() > 253) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "域名长度非法");
        }
        // 宽松校验：允许字母数字、点、连字符、下划线，且至少含一个点
        // 下划线常见于 TXT/DKIM/SPF 等记录名（如 _dnsauth、_dmarc）
        if (!domain.matches("^[A-Za-z0-9._-]+$") || !domain.contains(".")) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "域名格式非法：" + domain);
        }
    }
}
