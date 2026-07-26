package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.PortScanRequest;
import com.miao.toolbox.network.dto.PortScanResponse;
import com.miao.toolbox.network.dto.PortScanResponse.PortScanProbe;
import com.miao.toolbox.network.infrastructure.NetworkClientFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.InetAddress;
import java.net.Socket;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;

@Slf4j
@Service
@RequiredArgsConstructor
public class PortScanService {

    private final NetworkClientFactory networkClientFactory;

    /** 单次扫描最大端口数 */
    private static final int MAX_PORTS = 1000;

    /** 常见端口预设 */
    private static final List<Integer> COMMON_PORTS = List.of(
            21, 22, 23, 25, 53, 80, 110, 111, 135, 139,
            143, 443, 445, 993, 995, 1433, 1521, 3306,
            3389, 5432, 5900, 6379, 8080, 8443, 8888, 9090, 27017
    );

    /** 端口→服务名映射 */
    private static final Map<Integer, String> SERVICE_MAP = Map.ofEntries(
            Map.entry(21, "FTP"), Map.entry(22, "SSH"), Map.entry(23, "Telnet"),
            Map.entry(25, "SMTP"), Map.entry(53, "DNS"), Map.entry(80, "HTTP"),
            Map.entry(110, "POP3"), Map.entry(111, "RPCBind"), Map.entry(135, "MSRPC"),
            Map.entry(139, "NetBIOS"), Map.entry(143, "IMAP"), Map.entry(443, "HTTPS"),
            Map.entry(445, "SMB"), Map.entry(993, "IMAPS"), Map.entry(995, "POP3S"),
            Map.entry(1433, "MSSQL"), Map.entry(1521, "Oracle"), Map.entry(3306, "MySQL"),
            Map.entry(3389, "RDP"), Map.entry(5432, "PostgreSQL"), Map.entry(5900, "VNC"),
            Map.entry(6379, "Redis"), Map.entry(8080, "HTTP-Alt"), Map.entry(8443, "HTTPS-Alt"),
            Map.entry(8888, "HTTP-Alt2"), Map.entry(9090, "Prometheus"), Map.entry(27017, "MongoDB")
    );

    /**
     * 同步扫描，一次性返回全部结果
     */
    public PortScanResponse scan(PortScanRequest request) {
        return scanStreaming(request, null);
    }

    /**
     * 流式扫描，每完成一个端口回调一次
     */
    public PortScanResponse scanStreaming(PortScanRequest request, Consumer<PortScanProbe> onProbe) {
        long start = System.currentTimeMillis();

        // 1. 解析目标地址（含 SSRF 防护）
        String resolvedIp;
        try {
            InetAddress addr = networkClientFactory.resolveSafeAddress(request.getHost());
            resolvedIp = addr.getHostAddress();
        } catch (BusinessException e) {
            // SSRF 拦截，直接全部端口标记失败
            List<Integer> ports = parsePortRange(request.getPortRange());
            List<PortScanProbe> probes = new ArrayList<>();
            for (int port : ports) {
                PortScanProbe p = PortScanProbe.builder()
                        .port(port).open(false)
                        .errorCode(e.getErrorCode()).message(e.getMessage())
                        .build();
                probes.add(p);
                if (onProbe != null) onProbe.accept(p);
            }
            return PortScanResponse.builder()
                    .host(request.getHost()).resolvedIp("blocked")
                    .totalPorts(ports.size()).openCount(0).closedCount(ports.size())
                    .portRange(request.getPortRange())
                    .elapsedMs(System.currentTimeMillis() - start)
                    .probes(probes).build();
        }

        // 2. 解析端口列表
        List<Integer> ports = parsePortRange(request.getPortRange());

        // 3. 并发扫描
        Duration timeout = Duration.ofMillis(request.getTimeoutMs());
        int concurrency = Math.min(request.getConcurrency(), 20);
        ExecutorService executor = Executors.newFixedThreadPool(concurrency);
        List<PortScanProbe> probes = Collections.synchronizedList(new ArrayList<>(ports.size()));

        try {
            List<Future<PortScanProbe>> futures = new ArrayList<>();
            for (int port : ports) {
                futures.add(executor.submit(() -> probePort(request.getHost(), port, timeout)));
            }
            for (Future<PortScanProbe> f : futures) {
                try {
                    PortScanProbe probe = f.get();
                    probes.add(probe);
                    if (onProbe != null) onProbe.accept(probe);
                } catch (ExecutionException e) {
                    Throwable cause = e.getCause();
                    if (cause instanceof BusinessException be) {
                        PortScanProbe probe = PortScanProbe.builder()
                                .port(-1).open(false)
                                .errorCode(be.getErrorCode()).message(be.getMessage())
                                .build();
                        probes.add(probe);
                        if (onProbe != null) onProbe.accept(probe);
                    }
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "扫描被中断", 500);
        } finally {
            executor.shutdownNow();
        }

        // 4. 聚合结果
        int openCount = (int) probes.stream().filter(PortScanProbe::isOpen).count();
        return PortScanResponse.builder()
                .host(request.getHost())
                .resolvedIp(resolvedIp)
                .totalPorts(ports.size())
                .openCount(openCount)
                .closedCount(ports.size() - openCount)
                .portRange(request.getPortRange())
                .elapsedMs(System.currentTimeMillis() - start)
                .probes(probes)
                .build();
    }

    /**
     * 探测单个端口
     */
    private PortScanProbe probePort(String host, int port, Duration timeout) {
        try {
            long t0 = System.nanoTime();
            Socket socket = networkClientFactory.createTcpConnection(host, port, timeout);
            long latencyMs = (System.nanoTime() - t0) / 1_000_000;
            socket.close();
            return PortScanProbe.builder()
                    .port(port).open(true)
                    .latencyMs(latencyMs)
                    .service(SERVICE_MAP.getOrDefault(port, "Unknown"))
                    .build();
        } catch (BusinessException e) {
            return PortScanProbe.builder()
                    .port(port).open(false)
                    .errorCode(e.getErrorCode()).message(e.getMessage())
                    .build();
        } catch (java.io.IOException e) {
            return PortScanProbe.builder()
                    .port(port).open(false)
                    .errorCode(ErrorCode.NETWORK_CONNECTION_REFUSED)
                    .message(e.getMessage() != null ? e.getMessage() : "IO error")
                    .build();
        }
    }

    /**
     * 解析端口范围表达式
     * 支持格式：
     * - "common"：常见端口预设
     * - "80,443,8080"：逗号分隔
     * - "1-1024"：范围
     * - "80,443,1000-1010"：混合
     */
    List<Integer> parsePortRange(String expression) {
        if (expression == null || expression.isBlank()) {
            return new ArrayList<>(COMMON_PORTS);
        }
        String trimmed = expression.trim().toLowerCase();

        if ("common".equals(trimmed)) {
            return new ArrayList<>(COMMON_PORTS);
        }

        Set<Integer> ports = new LinkedHashSet<>();
        String[] parts = trimmed.split(",");
        for (String part : parts) {
            part = part.trim();
            if (part.contains("-")) {
                String[] range = part.split("-", 2);
                try {
                    int start = Math.max(1, Integer.parseInt(range[0].trim()));
                    int end = Math.min(65535, Integer.parseInt(range[1].trim()));
                    if (start > end) {
                        throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT,
                                "端口范围无效: " + part, 400);
                    }
                    for (int p = start; p <= end; p++) {
                        ports.add(p);
                    }
                } catch (NumberFormatException e) {
                    throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT,
                            "端口格式无效: " + part, 400);
                }
            } else {
                try {
                    int p = Integer.parseInt(part);
                    if (p < 1 || p > 65535) {
                        throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT,
                                "端口号超出范围: " + p, 400);
                    }
                    ports.add(p);
                } catch (NumberFormatException e) {
                    throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT,
                            "端口格式无效: " + part, 400);
                }
            }
        }

        if (ports.size() > MAX_PORTS) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT,
                    "端口数量超过上限 " + MAX_PORTS + "，当前 " + ports.size(), 400);
        }

        return new ArrayList<>(ports);
    }
}
