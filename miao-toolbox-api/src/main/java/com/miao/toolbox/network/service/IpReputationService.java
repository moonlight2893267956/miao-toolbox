package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.IpReputationRequest;
import com.miao.toolbox.network.dto.IpReputationResponse;
import com.miao.toolbox.network.infrastructure.AbuseIpdbClient;
import com.miao.toolbox.network.infrastructure.AbuseIpdbException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * IP 信誉检查服务：校验输入 IP（合法 + 公网），代理 AbuseIPDB 查询。
 */
@Service
@RequiredArgsConstructor
public class IpReputationService {

    private final AbuseIpdbClient abuseIpdbClient;

    private static final Pattern IPV4 = Pattern.compile(
        "^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");

    public IpReputationResponse check(IpReputationRequest req) {
        String ip = req.getIp() == null ? "" : req.getIp().trim();
        validateIp(ip);

        int maxAgeInDays = req.getMaxAgeInDays() != null ? req.getMaxAgeInDays() : 90;
        if (maxAgeInDays < 1 || maxAgeInDays > 365) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "统计窗口需在 1-365 天之间");
        }

        if (!abuseIpdbClient.isConfigured()) {
            return IpReputationResponse.builder()
                .ip(ip)
                .configured(false)
                .success(true)
                .message("未配置 AbuseIPDB API Key，无法查询。请在环境变量 ABUSEIPDB_API_KEY 中配置后重试。")
                .build();
        }

        try {
            IpReputationResponse resp = abuseIpdbClient.check(ip, maxAgeInDays);
            resp.setConfigured(true);
            resp.setSuccess(true);
            return resp;
        } catch (AbuseIpdbException e) {
            String message;
            if (e.getStatus() == 429) {
                message = "AbuseIPDB 配额已耗尽（HTTP 429），请稍后重试。";
            } else {
                message = "查询失败：" + e.getDetail();
            }
            return IpReputationResponse.builder()
                .ip(ip)
                .configured(true)
                .success(true)
                .message(message)
                .build();
        }
    }

    private void validateIp(String ip) {
        if (ip.isEmpty()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "IP 不能为空");
        }
        boolean looksLikeIp = IPV4.matcher(ip).matches()
            || (ip.contains(":") && ip.matches("^[0-9A-Fa-f:]+$"));
        if (!looksLikeIp) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "仅支持 IPv4/IPv6 地址字面量");
        }
        InetAddress addr;
        try {
            addr = InetAddress.getByName(ip);
        } catch (UnknownHostException e) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "IP 格式非法");
        }
        if (addr.isSiteLocalAddress() || addr.isLoopbackAddress() || addr.isLinkLocalAddress()
            || addr.isMulticastAddress() || addr.isAnyLocalAddress()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "不允许查询内网/保留地址");
        }
    }
}
