package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.network.dto.DnsRecord;
import org.springframework.stereotype.Component;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.AAAARecord;
import org.xbill.DNS.CNAMERecord;
import org.xbill.DNS.Lookup;
import org.xbill.DNS.MXRecord;
import org.xbill.DNS.NSRecord;
import org.xbill.DNS.PTRRecord;
import org.xbill.DNS.Record;
import org.xbill.DNS.Resolver;
import org.xbill.DNS.SOARecord;
import org.xbill.DNS.SimpleResolver;
import org.xbill.DNS.TXTRecord;
import org.xbill.DNS.TextParseException;
import org.xbill.DNS.Type;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * DNS 解析客户端封装：基于 dnsjava 按记录类型查询，并提取统一的 {@link DnsRecord}。
 */
@Component
public class DnsClientWrapper {

    private static final int DEFAULT_PORT = 53;

    /**
     * 查询域名在指定记录类型下的 DNS 记录。
     *
     * @param domain         待查询域名（FQDN）
     * @param typeCodes      dnsjava 记录类型常量（如 {@link Type#A}、{@link Type#AAAA}）
     * @param resolverSocket 自定义 DNS 服务器（已 SSRF 校验）；为 null 时使用 JVM 默认解析器
     * @param timeout        单次查询超时
     * @return 记录列表（可能为空）
     */
    public List<DnsRecord> query(String domain,
                                 List<Integer> typeCodes,
                                 InetSocketAddress resolverSocket,
                                 Duration timeout) throws DnsResolveException, IOException {
        Resolver resolver = buildResolver(resolverSocket, timeout);
        List<DnsRecord> result = new ArrayList<>();

        for (int type : typeCodes) {
            Lookup lookup;
            try {
                lookup = new Lookup(domain, type);
            } catch (TextParseException e) {
                throw new DnsResolveException("域名格式非法：" + domain);
            }
            lookup.setResolver(resolver);
            lookup.setCache(null); // 不复用缓存，保证实时解析
            Record[] answers = lookup.run();

            switch (lookup.getResult()) {
                case Lookup.SUCCESSFUL -> {
                    for (Record r : answers) {
                        result.add(toDnsRecord(r));
                    }
                }
                case Lookup.TYPE_NOT_FOUND -> {
                    // 该类型无记录，不算错误，跳过
                }
                case Lookup.HOST_NOT_FOUND ->
                        throw new DnsResolveException("域名不存在或无法解析：" + domain);
                case Lookup.TRY_AGAIN ->
                        throw new DnsResolveException("DNS 解析超时或临时失败：" + lookup.getErrorString());
                default ->
                        throw new DnsResolveException("DNS 解析失败：" + lookup.getErrorString());
            }
        }
        return result;
    }

    private Resolver buildResolver(InetSocketAddress resolverSocket, Duration timeout) throws IOException {
        Resolver resolver = (resolverSocket != null)
                ? new SimpleResolver(resolverSocket)
                : new SimpleResolver(); // JVM 默认（读取 /etc/resolv.conf）
        resolver.setTimeout(timeout);
        return resolver;
    }

    /**
     * 将 dnsjava 的 {@link Record} 转换为统一的 {@link DnsRecord}，按类型提取可读 value。
     */
    DnsRecord toDnsRecord(Record r) {
        String type = Type.string(r.getType());
        String value;
        if (r instanceof ARecord a) {
            value = a.getAddress().getHostAddress();
        } else if (r instanceof AAAARecord a) {
            value = a.getAddress().getHostAddress();
        } else if (r instanceof CNAMERecord c) {
            value = stripDot(c.getTarget().toString());
        } else if (r instanceof MXRecord mx) {
            value = mx.getPriority() + " " + stripDot(mx.getTarget().toString());
        } else if (r instanceof TXTRecord txt) {
            StringBuilder sb = new StringBuilder();
            for (Object s : txt.getStrings()) {
                sb.append(s);
            }
            value = sb.toString();
        } else if (r instanceof NSRecord ns) {
            value = stripDot(ns.getTarget().toString());
        } else if (r instanceof SOARecord soa) {
            value = stripDot(soa.getHost().toString()) + " " + stripDot(soa.getAdmin().toString())
                    + " " + soa.getSerial() + " " + soa.getRefresh() + " " + soa.getRetry()
                    + " " + soa.getExpire() + " " + soa.getMinimum();
        } else if (r instanceof PTRRecord ptr) {
            value = stripDot(ptr.getTarget().toString());
        } else {
            value = r.rdataToString();
        }
        return DnsRecord.builder()
                .name(stripDot(r.getName().toString()))
                .type(type)
                .ttl(r.getTTL())
                .value(value)
                .build();
    }

    /** 剥掉 dnsjava 绝对域名末尾的根域「.」，便于前端展示。 */
    private static String stripDot(String s) {
        if (s == null) {
            return null;
        }
        return s.endsWith(".") ? s.substring(0, s.length() - 1) : s;
    }

    public static int defaultPort() {
        return DEFAULT_PORT;
    }
}
