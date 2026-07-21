package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * 出站网络客户端工厂。所有 TCP 连接经 SSRF 校验，并受全局并发与超时约束。
 */
public class NetworkClientFactory {

    private static final Logger log = LoggerFactory.getLogger(NetworkClientFactory.class);

    private final SsrfProtector ssrfProtector;
    private final Semaphore connectionPermits;

    public NetworkClientFactory(SsrfProtector ssrfProtector) {
        this(ssrfProtector, NetworkTimeoutConfig.MAX_CONCURRENT_CONNECTIONS);
    }

    public NetworkClientFactory(SsrfProtector ssrfProtector, int maxConcurrent) {
        this.ssrfProtector = Objects.requireNonNull(ssrfProtector, "ssrfProtector");
        this.connectionPermits = new Semaphore(Math.max(1, maxConcurrent), true);
    }

    /**
     * 创建到目标主机的 TCP 连接（先 SSRF 校验再连接）。
     * <p>
     * 调用方必须在 try-with-resources 中关闭返回的 Socket。
     *
     * @param host    主机名或 IP
     * @param port    端口 1–65535
     * @param timeout 连接超时
     * @return 已连接的 Socket
     */
    public Socket createTcpConnection(String host, int port, Duration timeout) {
        validatePort(port);
        Duration t = timeout != null ? timeout : NetworkTimeoutConfig.DEFAULT_CONNECT;
        int timeoutMs = toMillis(t);

        InetAddress safeIp = ssrfProtector.resolveAndValidate(host);

        boolean acquired = false;
        try {
            acquired = connectionPermits.tryAcquire(
                    Math.min(Math.max(timeoutMs, 1), 5_000), TimeUnit.MILLISECONDS);
            if (!acquired) {
                throw new BusinessException(
                        ErrorCode.NETWORK_RATE_LIMITED,
                        "出站连接繁忙，请稍后重试",
                        429);
            }

            Socket socket = new Socket();
            try {
                ssrfProtector.validateAddress(safeIp);
                socket.connect(new InetSocketAddress(safeIp, port), timeoutMs);
                socket.setSoTimeout(timeoutMs);
                log.debug("TCP connected host={} ip={} port={} timeoutMs={}",
                        host, safeIp.getHostAddress(), port, timeoutMs);
                // 连接建立后释放「握手并发」许可；长连接占用由上层业务控制
                connectionPermits.release();
                acquired = false;
                return socket;
            } catch (SocketTimeoutException e) {
                closeQuietly(socket);
                throw new BusinessException(
                        ErrorCode.NETWORK_CONNECTION_TIMEOUT,
                        "连接超时: " + host + ":" + port,
                        504);
            } catch (IOException e) {
                closeQuietly(socket);
                String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
                if (msg.contains("refused") || msg.contains("connection reset")) {
                    throw new BusinessException(
                            ErrorCode.NETWORK_CONNECTION_REFUSED,
                            "连接被拒绝: " + host + ":" + port,
                            502);
                }
                throw new BusinessException(
                        ErrorCode.NETWORK_HOST_UNREACHABLE,
                        "主机不可达: " + host + ":" + port,
                        502);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "连接被中断", 500);
        } finally {
            if (acquired) {
                connectionPermits.release();
            }
        }
    }

    /** TCP Ping 默认超时 */
    public Socket createTcpPingConnection(String host, int port) {
        return createTcpConnection(host, port, NetworkTimeoutConfig.TCP_PING);
    }

    /**
     * 仅做 SSRF 解析校验并返回安全 IP（不建连），供 DNS/HTTP 等上层使用。
     */
    public InetAddress resolveSafeAddress(String host) {
        return ssrfProtector.resolveAndValidate(host);
    }

    public int availablePermits() {
        return connectionPermits.availablePermits();
    }

    private static void validatePort(int port) {
        if (port < 1 || port > 65535) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "端口须在 1–65535", 400);
        }
    }

    private static int toMillis(Duration d) {
        long ms = d.toMillis();
        if (ms <= 0) {
            return 1;
        }
        if (ms > Integer.MAX_VALUE) {
            return Integer.MAX_VALUE;
        }
        return (int) ms;
    }

    private static void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
            // ignore
        }
    }
}
