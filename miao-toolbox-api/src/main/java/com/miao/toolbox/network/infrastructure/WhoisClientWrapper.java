package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.constant.ErrorCode;
import org.apache.commons.net.whois.WhoisClient;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * WHOIS 客户端封装：基于 commons-net {@link WhoisClient}（TCP 43）。
 * <p>
 * 安全约束：所有出站连接必须经由 {@link SsrfProtector#resolveAndValidate(String)} 校验后的地址，
 * 禁止直接连接用户传入的主机名，避免 SSRF。
 * <p>
 * 自动 referral：域名先查 whois.iana.org 拿到 TLD 权威服务器；IP 先查 whois.arin.net，
 * 若响应含 ReferralServer 则跟随查询对应 RIR。
 */
@Component
public class WhoisClientWrapper {

    private static final int WHOIS_PORT = 43;
    private static final String IANA_WHOIS = "whois.iana.org";
    private static final String ARIN_WHOIS = "whois.arin.net";
    private static final int MAX_REFERRAL_HOPS = 2;

    /** 常见 TLD → 权威 WHOIS 服务器（IANA 不可达时的 fallback）。 */
    private static final Map<String, String> TLD_SERVER_FALLBACK = Map.of(
            "com", "whois.verisign-grs.com",
            "net", "whois.verisign-grs.com",
            "org", "whois.pir.org",
            "info", "whois.afilias.net",
            "io", "whois.nic.io",
            "cn", "whois.cnnic.cn",
            "cc", "ccwhois.verisign-grs.com",
            "me", "whois.nic.me",
            "xyz", "whois.nic.xyz",
            "top", "whois.nic.top"
    );

    private final SsrfProtector ssrfProtector;

    private static final Pattern WHOIS_SERVER_PATTERN = Pattern.compile(
            "(?im)^\\s*(?:whois(?:(?:\\s+server)|(?:\\s*server))?|registrar\\s+whois\\s+server|refer(?:ral)?\\s*server)\\s*[:=]\\s*(\\S+)");

    public WhoisClientWrapper(SsrfProtector ssrfProtector) {
        this.ssrfProtector = ssrfProtector;
    }

    /** 查询结果（含实际使用的服务器，便于回显）。 */
    public record WhoisRawResult(String text, String server) {
    }

    public WhoisRawResult query(String target, String explicitServer, Duration timeout)
            throws WhoisQueryException {
        String server = (explicitServer != null && !explicitServer.isBlank())
                ? normalizeHost(explicitServer.trim())
                : resolveDefaultServer(target, timeout);

        String text = doQuery(target, server, timeout);
        // 跟随 referral（限制跳数，避免循环）
        int hops = 0;
        String current = server;
        while (hops < MAX_REFERRAL_HOPS) {
            String referral = extractWhoisServer(text);
            // IANA 仅提供 TLD 层级信息，不是域名注册详情服务器，不作为 referral 目标
            if (referral == null || referral.equalsIgnoreCase(current)
                    || referral.equalsIgnoreCase(IANA_WHOIS)) {
                break;
            }
            try {
                String referred = doQuery(target, referral, timeout);
                if (referred != null && !referred.isBlank()) {
                    text = referred;
                    current = referral;
                }
            } catch (WhoisQueryException e) {
                // referral 失败则保留原结果
                break;
            }
            hops++;
        }
        return new WhoisRawResult(text, current);
    }

    /** 根据目标类型选择默认 WHOIS 服务器。 */
    private String resolveDefaultServer(String target, Duration timeout) throws WhoisQueryException {
        if (isIp(target)) {
            return ARIN_WHOIS;
        }
        // 域名：查 IANA 拿 TLD 权威服务器
        int lastDot = target.lastIndexOf('.');
        if (lastDot < 0) {
            return IANA_WHOIS;
        }
        String tld = target.substring(lastDot + 1).toLowerCase();
        // 先尝试 IANA
        try {
        String ianaText = doQuery(tld, IANA_WHOIS, timeout);
        String tldServer = extractWhoisServer(ianaText);
            if (tldServer != null) {
                return tldServer;
            }
        } catch (WhoisQueryException e) {
            // IANA 不可达，走 fallback
        }
        // IANA 无返回或不可达 → fallback 到已知 TLD 服务器
        return TLD_SERVER_FALLBACK.getOrDefault(tld, IANA_WHOIS);
    }

    private String doQuery(String target, String server, Duration timeout) throws WhoisQueryException {
        // 优先使用 commons-net
        String result = doCommonsNetQuery(target, server, timeout);
        // commons-net 返回空时 fallback 到系统 whois 命令
        if ((result == null || result.isBlank()) && isWhoisCommandAvailable()) {
            result = doSystemWhoisQuery(target, server, timeout);
        }
        if (result == null || result.isBlank()) {
            throw new WhoisQueryException(ErrorCode.NETWORK_CONNECTION_REFUSED,
                    "WHOIS 服务器无返回: " + server);
        }
        return result;
    }

    private String doCommonsNetQuery(String target, String server, Duration timeout) throws WhoisQueryException {
        InetAddress safeAddress = ssrfProtector.resolveAndValidate(server);
        WhoisClient whois = new WhoisClient();
        whois.setDefaultTimeout((int) Math.min(timeout.toMillis(), Integer.MAX_VALUE));
        try {
            whois.connect(safeAddress, WHOIS_PORT);
            return whois.query(target);
        } catch (SocketTimeoutException e) {
            throw new WhoisQueryException(ErrorCode.NETWORK_CONNECTION_TIMEOUT,
                    "WHOIS 查询超时: " + server);
        } catch (IOException e) {
            throw new WhoisQueryException(ErrorCode.NETWORK_CONNECTION_REFUSED,
                    "WHOIS 查询失败: " + e.getMessage());
        } finally {
            try {
                whois.disconnect();
            } catch (IOException ignored) {
            }
        }
    }

    private static volatile Boolean whoisCommandAvailable;

    private static boolean isWhoisCommandAvailable() {
        if (whoisCommandAvailable == null) {
            try {
                Process p = new ProcessBuilder("which", "whois").inheritIO().start();
                whoisCommandAvailable = p.waitFor() == 0;
            } catch (Exception e) {
                whoisCommandAvailable = false;
            }
        }
        return whoisCommandAvailable;
    }

    private String doSystemWhoisQuery(String target, String server, Duration timeout) throws WhoisQueryException {
        try {
            ProcessBuilder pb = new ProcessBuilder("whois", "-h", server, target);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            boolean finished = p.waitFor(timeout.toMillis(), java.util.concurrent.TimeUnit.MILLISECONDS);
            if (!finished) {
                p.destroyForcibly();
                throw new WhoisQueryException(ErrorCode.NETWORK_CONNECTION_TIMEOUT,
                        "WHOIS 查询超时(system): " + server);
            }
            String output = new String(p.getInputStream().readAllBytes());
            return output.isBlank() ? null : output;
        } catch (WhoisQueryException e) {
            throw e;
        } catch (Exception e) {
            return null;
        }
    }

    /** 从 WHOIS 文本中解析出 referral / 权威 WHOIS 服务器主机名。 */
    String extractWhoisServer(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        Matcher matcher = WHOIS_SERVER_PATTERN.matcher(text);
        while (matcher.find()) {
            String raw = matcher.group(1).trim();
            String host = normalizeHost(raw);
            if (!host.isBlank()) {
                return host;
            }
        }
        return null;
    }

    /** 规范化 host：去掉 whois://、rwhois://、端口、引号、尾点。 */
    static String normalizeHost(String raw) {
        if (raw == null) {
            return "";
        }
        String h = raw.trim();
        int schemeIdx = h.indexOf("://");
        if (schemeIdx >= 0) {
            h = h.substring(schemeIdx + 3);
        }
        // 去掉端口（host:port 或 [ipv6]:port）
        int portIdx = h.lastIndexOf(':');
        if (portIdx > 0 && h.indexOf(':') == portIdx && !h.startsWith("[")) {
            h = h.substring(0, portIdx);
        }
        h = h.replaceAll("[\"']", "");
        if (h.endsWith(".")) {
            h = h.substring(0, h.length() - 1);
        }
        return h.toLowerCase();
    }

    /** 判断输入是否为 IP 地址（v4/v6）。 */
    public static boolean isIp(String s) {
        if (s == null || s.isBlank()) {
            return false;
        }
        // IPv6 含冒号；IPv4 含点且四段数字
        if (s.contains(":")) {
            return true;
        }
        String[] parts = s.split("\\.");
        if (parts.length != 4) {
            return false;
        }
        for (String p : parts) {
            if (!p.matches("\\d{1,3}")) {
                return false;
            }
            int v = Integer.parseInt(p);
            if (v > 255) {
                return false;
            }
        }
        return true;
    }
}
