package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.SslAnalyzerRequest;
import com.miao.toolbox.network.dto.SslAnalyzerResponse;
import com.miao.toolbox.network.infrastructure.NetworkTimeoutConfig;
import com.miao.toolbox.network.infrastructure.SslAnalyzerClient;
import com.miao.toolbox.network.infrastructure.SslAnalyzerException;
import java.time.Duration;
import org.springframework.stereotype.Service;

/**
 * SSL/TLS 证书分析服务：输入校验、调用客户端、异常映射。
 *
 * <p>网络层异常（DNS 解析失败、SSRF 拦截、连接超时、连接失败、握手失败）一律以
 * {@code success=true, errorMessage="..."} 的友好响应返回，与
 * {@code HttpHeaderAnalyzerService} / {@code IpReputationService} 的降级策略保持一致，
 * 避免前端展示裸 HTTP 状态码。
 */
@Service
public class SslAnalyzerService {

    private final SslAnalyzerClient sslAnalyzerClient;

    public SslAnalyzerService(SslAnalyzerClient sslAnalyzerClient) {
        this.sslAnalyzerClient = sslAnalyzerClient;
    }

    public SslAnalyzerResponse analyze(SslAnalyzerRequest request) {
        String host = (request.getHost() == null) ? null : request.getHost().trim();
        if (host == null || host.isBlank() || host.length() > 253) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "主机不能为空且长度不超过 253");
        }

        int port = request.getPort() != null ? request.getPort() : 443;
        // 允许 host:port 形式（与 SsrfProtector 的归一化规则保持一致）
        int colon = host.lastIndexOf(':');
        if (colon > 0 && request.getPort() == null && host.indexOf(':') == colon && !host.startsWith("[")) {
            String maybePort = host.substring(colon + 1);
            if (maybePort.matches("\\d{1,5}")) {
                int p = Integer.parseInt(maybePort);
                if (p >= 1 && p <= 65535) {
                    port = p;
                    host = host.substring(0, colon);
                }
            }
        }
        if (port < 1 || port > 65535) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "端口范围需在 1-65535 之间");
        }

        int timeoutMs = request.getTimeoutMs() != null
                ? request.getTimeoutMs()
                : (int) NetworkTimeoutConfig.SSL_HANDSHAKE.toMillis();
        if (timeoutMs < 1000 || timeoutMs > 55000) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "超时时间需在 1000-55000 毫秒之间");
        }

        try {
            SslAnalyzerClient.SslAnalysisResult r =
                    sslAnalyzerClient.analyze(host, port, Duration.ofMillis(timeoutMs));
            return SslAnalyzerResponse.builder()
                    .host(host)
                    .port(port)
                    .resolvedIp(r.getResolvedIp())
                    .protocol(r.getProtocol())
                    .cipherSuite(r.getCipherSuite())
                    .peerVerified(r.isPeerVerified())
                    .certificateError(r.getCertificateError())
                    .chain(r.getChain())
                    .handshakeTimeMs(r.getHandshakeTimeMs())
                    .success(true)
                    .build();
        } catch (BusinessException e) {
            // SSRF / DNS 解析失败：友好降级，不抛出
            return graceful(host, port, friendlyNetworkMessage(e));
        } catch (SslAnalyzerException e) {
            return graceful(host, port, friendlySslMessage(e));
        }
    }

    private SslAnalyzerResponse graceful(String host, int port, String message) {
        return SslAnalyzerResponse.builder()
                .host(host)
                .port(port)
                .success(true)
                .errorMessage(message)
                .build();
    }

    private String friendlyNetworkMessage(BusinessException e) {
        String code = e.getErrorCode();
        if (ErrorCode.NETWORK_DNS_RESOLVE_FAILED.equals(code)) {
            return "无法解析该域名，请检查域名是否正确：" + hostOf(e.getMessage());
        }
        if (ErrorCode.NETWORK_SSRF_BLOCKED.equals(code)) {
            return "目标地址不允许访问（受保护网段）：" + hostOf(e.getMessage());
        }
        return "SSL 分析失败：" + e.getMessage();
    }

    private String friendlySslMessage(SslAnalyzerException e) {
        String code = e.getErrorCode();
        if (ErrorCode.NETWORK_CONNECTION_TIMEOUT.equals(code)) {
            return "SSL 连接超时，请检查目标端口是否可达：" + e.getMessage();
        }
        if (ErrorCode.NETWORK_CONNECTION_REFUSED.equals(code)) {
            return "SSL 连接被拒绝，请确认目标端口已开启：" + e.getMessage();
        }
        if (ErrorCode.NETWORK_SSL_HANDSHAKE_FAILED.equals(code)) {
            return "SSL 握手失败，请确认目标提供 TLS 服务：" + e.getMessage();
        }
        return "SSL 分析失败：" + e.getMessage();
    }

    private static String hostOf(String message) {
        if (message == null) return "";
        int idx = message.indexOf(':');
        return idx > 0 ? message.substring(idx + 1).trim() : message;
    }
}