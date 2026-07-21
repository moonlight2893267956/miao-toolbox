package com.miao.toolbox.network.service;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.TcpPingRequest;
import com.miao.toolbox.network.dto.TcpPingResponse;
import com.miao.toolbox.network.dto.TcpPingResponse.TcpPingProbe;
import com.miao.toolbox.network.infrastructure.NetworkClientFactory;
import com.miao.toolbox.network.infrastructure.NetworkTimeoutConfig;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * TCP Ping：多次 TCP 连接探测延迟（替代 ICMP）。
 */
@Service
@RequiredArgsConstructor
public class TcpPingService {

    private final NetworkClientFactory networkClientFactory;

    public TcpPingResponse ping(TcpPingRequest request) {
        List<TcpPingProbe> probes = new ArrayList<>();
        // 批量模式：无间隔，一次性返回
        pingInternal(request, probes::add, 0L);
        return buildResponse(request, probes);
    }

    /**
     * 连续探测，每完成一次回调（用于 SSE）。
     * 每次探测之间按 {@code intervalMs} 间隔，从而在前端逐条呈现。
     */
    public TcpPingResponse pingStreaming(TcpPingRequest request, Consumer<TcpPingProbe> onProbe) {
        List<TcpPingProbe> probes = new ArrayList<>();
        long interval = request.getIntervalMs() != null ? request.getIntervalMs() : 1000L;
        pingInternal(request, probe -> {
            probes.add(probe);
            if (onProbe != null) {
                onProbe.accept(probe);
            }
        }, interval);
        return buildResponse(request, probes);
    }

    private void pingInternal(TcpPingRequest request, Consumer<TcpPingProbe> onProbe, long intervalMs) {
        String host = request.getHost().trim();
        int port = request.getPort() != null ? request.getPort() : 443;
        int count = request.getCount() != null ? request.getCount() : 4;

        // 先 SSRF 校验；失败则整批失败（不建连）
        try {
            networkClientFactory.resolveSafeAddress(host);
        } catch (BusinessException ex) {
            for (int i = 1; i <= count; i++) {
                onProbe.accept(TcpPingProbe.builder()
                        .seq(i)
                        .success(false)
                        .errorCode(ex.getErrorCode())
                        .message(ex.getMessage())
                        .build());
            }
            return;
        }

        for (int i = 1; i <= count; i++) {
            onProbe.accept(probeOnce(i, host, port));
            // 连续模式下在两次探测之间休眠，实现逐条推送的节奏感
            if (intervalMs > 0 && i < count) {
                try {
                    Thread.sleep(intervalMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
    }

    private TcpPingProbe probeOnce(int seq, String host, int port) {
        long start = System.nanoTime();
        try (Socket socket = networkClientFactory.createTcpConnection(
                host, port, NetworkTimeoutConfig.TCP_PING)) {
            long ms = Math.max(0, (System.nanoTime() - start) / 1_000_000L);
            return TcpPingProbe.builder()
                    .seq(seq)
                    .success(true)
                    .latencyMs(ms)
                    .message("connected")
                    .build();
        } catch (BusinessException ex) {
            long ms = Math.max(0, (System.nanoTime() - start) / 1_000_000L);
            return TcpPingProbe.builder()
                    .seq(seq)
                    .success(false)
                    .latencyMs(ms)
                    .errorCode(ex.getErrorCode())
                    .message(ex.getMessage())
                    .build();
        } catch (Exception ex) {
            long ms = Math.max(0, (System.nanoTime() - start) / 1_000_000L);
            return TcpPingProbe.builder()
                    .seq(seq)
                    .success(false)
                    .latencyMs(ms)
                    .errorCode("NETWORK_HOST_UNREACHABLE")
                    .message(ex.getMessage() != null ? ex.getMessage() : "连接失败")
                    .build();
        }
    }

    private TcpPingResponse buildResponse(TcpPingRequest request, List<TcpPingProbe> probes) {
        String host = request.getHost().trim();
        int port = request.getPort() != null ? request.getPort() : 443;
        int count = probes.size();
        int success = (int) probes.stream().filter(TcpPingProbe::isSuccess).count();
        int fail = count - success;
        var avgOpt = probes.stream()
                .filter(TcpPingProbe::isSuccess)
                .map(TcpPingProbe::getLatencyMs)
                .filter(v -> v != null)
                .mapToLong(Long::longValue)
                .average();
        Double avg = avgOpt.isPresent() ? avgOpt.getAsDouble() : null;

        String resolvedIp = null;
        try {
            resolvedIp = networkClientFactory.resolveSafeAddress(host).getHostAddress();
        } catch (BusinessException ignored) {
            // SSRF 失败时 probes 已含错误
        }

        return TcpPingResponse.builder()
                .host(host)
                .port(port)
                .resolvedIp(resolvedIp)
                .count(count)
                .successCount(success)
                .failCount(fail)
                .avgLatencyMs(avg)
                .probes(probes)
                .build();
    }
}
