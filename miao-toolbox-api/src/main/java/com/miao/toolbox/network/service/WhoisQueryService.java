package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.WhoisField;
import com.miao.toolbox.network.dto.WhoisQueryRequest;
import com.miao.toolbox.network.dto.WhoisQueryResponse;
import com.miao.toolbox.network.infrastructure.NetworkTimeoutConfig;
import com.miao.toolbox.network.infrastructure.WhoisClientWrapper;
import com.miao.toolbox.network.infrastructure.WhoisQueryException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * WHOIS 查询服务：目标校验、类型判定、调用客户端、字段解析与异常映射。
 */
@Service
public class WhoisQueryService {

    private final WhoisClientWrapper whoisClientWrapper;

    public WhoisQueryService(WhoisClientWrapper whoisClientWrapper) {
        this.whoisClientWrapper = whoisClientWrapper;
    }

    public WhoisQueryResponse query(WhoisQueryRequest req) {
        String target = (req.getTarget() == null) ? null : req.getTarget().trim();
        if (target == null || target.isBlank() || target.length() > 253) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "查询目标不能为空且长度不超过 253");
        }
        if (!isValidTarget(target)) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "查询目标格式非法（应为域名或 IP）");
        }

        boolean isIp = WhoisClientWrapper.isIp(target);
        Duration timeout = resolveTimeout(req.getTimeoutMs());

        WhoisClientWrapper.WhoisRawResult result;
        try {
            result = whoisClientWrapper.query(target, req.getWhoisServer(), timeout);
        } catch (WhoisQueryException e) {
            throw new BusinessException(e.getErrorCode(), e.getMessage());
        }

        List<WhoisField> fields = parseFields(result.text(), isIp);
        boolean found = isFound(result.text());
        return WhoisQueryResponse.builder()
                .target(target)
                .queryType(isIp ? "IP" : "DOMAIN")
                .whoisServer(result.server())
                .fields(fields)
                .raw(result.text())
                .found(found)
                .build();
    }

    private boolean isValidTarget(String target) {
        if (WhoisClientWrapper.isIp(target)) {
            return true;
        }
        // 域名：字母数字、点、连字符、下划线，且至少含一个点
        return target.matches("^[A-Za-z0-9._-]+$") && target.contains(".");
    }

    private Duration resolveTimeout(Integer timeoutMs) {
        if (timeoutMs == null) {
            return NetworkTimeoutConfig.WHOIS;
        }
        if (timeoutMs < 1000 || timeoutMs > 55_000) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "超时时间需在 1000-55000 毫秒之间");
        }
        return Duration.ofMillis(timeoutMs);
    }

    /**
     * best-effort 解析 WHOIS 文本为结构化字段。
     */
    private List<WhoisField> parseFields(String text, boolean isIp) {
        Map<String, String> map = new LinkedHashMap<>();
        List<String> multiStatus = new ArrayList<>();
        List<String> multiNs = new ArrayList<>();

        if (isIp) {
            putFirst(map, "组织", text, "Organization:\\s*(.+)");
            putFirst(map, "ASN", text, "OriginAS:\\s*(\\S+)", "ASN:\\s*(\\S+)");
            putFirst(map, "国家", text, "Country:\\s*(\\S+)");
            putFirst(map, "网络范围", text, "NetRange:\\s*(.+)");
            putFirst(map, "CIDR", text, "CIDR:\\s*(\\S+)");
            collectAll(multiNs, text, "Name Server:\\s*(\\S+)");
        } else {
            putFirst(map, "注册商", text, "Registrar:\\s*(.+)");
            putFirst(map, "注册商 WHOIS", text, "Registrar WHOIS Server:\\s*(.+)");
            putFirst(map, "创建时间", text,
                    "Creation Date:\\s*(.+)", "Created:\\s*(.+)", "Registered On:\\s*(.+)");
            putFirst(map, "过期时间", text,
                    "Registry Expiry Date:\\s*(.+)", "Expiry Date:\\s*(.+)",
                    "Expiration Date:\\s*(.+)", "Registrar Registration Expiration Date:\\s*(.+)");
            putFirst(map, "更新时间", text, "Updated Date:\\s*(.+)");
            putFirst(map, "注册人组织", text, "Registrant Organization:\\s*(.+)");
            collectAll(multiStatus, text, "Domain Status:\\s*(\\S+[^\\r\\n]*)");
            collectAll(multiNs, text, "Name Server:\\s*(\\S+)");
        }

        List<WhoisField> fields = new ArrayList<>();
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (e.getValue() != null && !e.getValue().isBlank()) {
                fields.add(WhoisField.builder().key(e.getKey()).value(e.getValue().trim()).build());
            }
        }
        for (String s : multiStatus) {
            fields.add(WhoisField.builder().key("域名状态").value(s.trim()).build());
        }
        for (String ns : multiNs) {
            fields.add(WhoisField.builder().key("域名服务器").value(ns.trim()).build());
        }
        return fields;
    }

    /** 取第一个命中的正则捕获值。 */
    private void putFirst(Map<String, String> map, String key, String text, String... patterns) {
        for (String p : patterns) {
            String v = matchFirst(text, p);
            if (v != null) {
                map.put(key, v);
                return;
            }
        }
    }

    private void collectAll(List<String> out, String text, String pattern) {
        Matcher m = Pattern.compile("(?im)" + pattern).matcher(text);
        while (m.find()) {
            out.add(m.group(1));
        }
    }

    private String matchFirst(String text, String pattern) {
        if (text == null) {
            return null;
        }
        Matcher m = Pattern.compile("(?im)" + pattern).matcher(text);
        return m.find() ? m.group(1) : null;
    }

    private boolean isFound(String text) {
        if (text == null || text.isBlank()) {
            return false;
        }
        String lower = text.toLowerCase();
        return !(lower.contains("no match")
                || lower.contains("no entries found")
                || lower.contains("not found")
                || lower.contains("no data found")
                || lower.contains("domain not found")
                || lower.contains("object does not exist"));
    }
}
