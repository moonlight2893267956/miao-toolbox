package com.miao.toolbox.network.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.WebSocketConnectRequest;
import com.miao.toolbox.network.dto.WebSocketDisconnectRequest;
import com.miao.toolbox.network.dto.WebSocketEvent;
import com.miao.toolbox.network.dto.WebSocketSendRequest;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * WebSocket 测试器核心服务。
 *
 * <p>设计要点：
 * <ul>
 *   <li>使用 OkHttp 的 {@link WebSocket} 客户端连接目标，复用 {@link SsrfProtector} 的自定义
 *       DNS 将 host 强制解析到单一安全公网 IP（wss 时仍用原始 host 做 TLS SNI/校验），从源头杜绝 SSRF。</li>
 *   <li>前后端实时通道复用 SSE（每会话一个 {@link SseEmitter}），事件先入缓冲队列再推送，
 *       避免前端订阅前错过 connected 等早期事件。</li>
 *   <li>连接建立后空闲（无收发）满 {@value #IDLE_TIMEOUT_MS} 由定时任务自动断开并通知前端。</li>
 * </ul>
 */
@Slf4j
@Service
public class WebSocketTesterService {

    private final SsrfProtector ssrfProtector;

    private static final long IDLE_TIMEOUT_MS = 30_000L;
    private static final long IDLE_CHECK_INTERVAL_MS = 5_000L;
    private static final int MAX_BUFFER = 200;

    private final ConcurrentHashMap<String, SessionState> sessions = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2, r -> {
        Thread t = new Thread(r, "ws-tester-idle");
        t.setDaemon(true);
        return t;
    });

    public WebSocketTesterService(SsrfProtector ssrfProtector) {
        this.ssrfProtector = ssrfProtector;
    }

    /** 建立到目标的 WebSocket 连接，返回会话 ID（事件稍后通过 SSE 推送）。 */
    public String connect(WebSocketConnectRequest req) {
        String url = req.getUrl();
        if (url == null || (!url.startsWith("ws://") && !url.startsWith("wss://"))) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 必须以 ws:// 或 wss:// 开头", 400);
        }
        String host = URI.create(url).getHost();
        if (host == null || host.isEmpty()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 缺少主机", 400);
        }
        // SSRF：解析并校验 host（阻断内网/环回/链路本地），失败直接抛异常
        ssrfProtector.resolveAndValidate(host);

        String sessionId = UUID.randomUUID().toString();
        OkHttpClient client = buildWsClient();
        Request.Builder rb = new Request.Builder().url(url).header("User-Agent", "MiaoToolbox/1.0");
        if (req.getSubprotocols() != null && !req.getSubprotocols().isBlank()) {
            rb.header("Sec-WebSocket-Protocol", req.getSubprotocols().trim());
        }
        if (req.getHeaders() != null) {
            req.getHeaders().forEach(rb::header);
        }
        Request request = rb.build();

        SessionState state = new SessionState(sessionId);
        sessions.put(sessionId, state);
        state.lastActivity = System.currentTimeMillis();
        state.idleFuture = scheduler.scheduleAtFixedRate(
                () -> checkIdle(sessionId), IDLE_CHECK_INTERVAL_MS, IDLE_CHECK_INTERVAL_MS, TimeUnit.MILLISECONDS);

        state.webSocket = client.newWebSocket(request, new WsListener(state));
        return sessionId;
    }

    /** 订阅 SSE 事件流（先 flush 缓冲的早期事件）。 */
    public SseEmitter subscribe(String sessionId) {
        SessionState state = sessions.get(sessionId);
        if (state == null) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "会话不存在或已关闭", 404);
        }
        SseEmitter emitter = new SseEmitter(0L);
        state.emitter = emitter;
        emitter.onCompletion(() -> { if (state.emitter == emitter) state.emitter = null; });
        emitter.onTimeout(() -> { if (state.emitter == emitter) state.emitter = null; });
        emitter.onError(e -> { if (state.emitter == emitter) state.emitter = null; });
        WebSocketEvent ev;
        while ((ev = state.buffer.poll()) != null) {
            try {
                emitter.send(SseEmitter.event().name(ev.getType()).data(ev));
            } catch (Exception e) {
                state.emitter = null;
                break;
            }
        }
        return emitter;
    }

    public void send(WebSocketSendRequest req) {
        SessionState state = sessions.get(req.getSessionId());
        if (state == null || state.webSocket == null) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "会话不存在或连接未建立", 404);
        }
        state.webSocket.send(req.getMessage());
        state.lastActivity = System.currentTimeMillis();
        push(state, WebSocketEvent.sent(req.getMessage()));
    }

    public void disconnect(WebSocketDisconnectRequest req) {
        closeInternal(req.getSessionId(), 1000, "user disconnect");
    }

    // ===================== 内部 =====================

    private void checkIdle(String sessionId) {
        SessionState state = sessions.get(sessionId);
        if (state == null) {
            return;
        }
        if (System.currentTimeMillis() - state.lastActivity > IDLE_TIMEOUT_MS) {
            push(state, WebSocketEvent.closed(1000, "空闲超过 30s，已自动断开"));
            closeInternal(sessionId, 1000, "idle timeout");
        }
    }

    private void push(SessionState state, WebSocketEvent event) {
        state.buffer.add(event);
        while (state.buffer.size() > MAX_BUFFER) {
            state.buffer.poll();
        }
        SseEmitter em = state.emitter;
        if (em != null) {
            try {
                em.send(SseEmitter.event().name(event.getType()).data(event));
            } catch (Exception e) {
                state.emitter = null;
            }
        }
    }

    private void closeInternal(String sessionId, int code, String reason) {
        SessionState state = sessions.get(sessionId);
        if (state == null) {
            return;
        }
        if (state.idleFuture != null) {
            try {
                state.idleFuture.cancel(true);
            } catch (Exception ignored) {
                // ignore
            }
        }
        if (state.webSocket != null) {
            try {
                state.webSocket.close(code, reason);
            } catch (Exception ignored) {
                // ignore
            }
        }
        sessions.remove(sessionId);
        SseEmitter em = state.emitter;
        if (em != null) {
            try {
                em.complete();
            } catch (Exception ignored) {
                // ignore
            }
        }
    }

    private OkHttpClient buildWsClient() {
        return new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.SECONDS)
                .writeTimeout(10, TimeUnit.SECONDS)
                .dns(hostname -> List.of(ssrfProtector.resolveAndValidate(hostname)))
                .build();
    }

    /** 单会话状态。 */
    static final class SessionState {
        final String sessionId;
        WebSocket webSocket;
        SseEmitter emitter;
        final ConcurrentLinkedQueue<WebSocketEvent> buffer = new ConcurrentLinkedQueue<>();
        volatile long lastActivity;
        ScheduledFuture<?> idleFuture;

        SessionState(String sessionId) {
            this.sessionId = sessionId;
        }
    }

    /** OkHttp WebSocket 回调，将生命周期事件转发为 SSE 推送。 */
    class WsListener extends WebSocketListener {
        private final SessionState state;

        WsListener(SessionState state) {
            this.state = state;
        }

        @Override
        public void onOpen(WebSocket webSocket, Response response) {
            state.lastActivity = System.currentTimeMillis();
            push(state, WebSocketEvent.connected());
        }

        @Override
        public void onMessage(WebSocket webSocket, String text) {
            state.lastActivity = System.currentTimeMillis();
            push(state, WebSocketEvent.received(text));
        }

        @Override
        public void onMessage(WebSocket webSocket, ByteString bytes) {
            state.lastActivity = System.currentTimeMillis();
            push(state, WebSocketEvent.received("<binary " + bytes.size() + " bytes>"));
        }

        @Override
        public void onClosing(WebSocket webSocket, int code, String reason) {
            push(state, WebSocketEvent.closing(code, reason));
            try {
                webSocket.close(1000, null);
            } catch (Exception ignored) {
                // ignore
            }
        }

        @Override
        public void onClosed(WebSocket webSocket, int code, String reason) {
            push(state, WebSocketEvent.closed(code, reason));
            closeInternal(state.sessionId, code, reason);
        }

        @Override
        public void onFailure(WebSocket webSocket, Throwable t, Response response) {
            push(state, WebSocketEvent.error(t == null ? "unknown" : t.getMessage()));
            closeInternal(state.sessionId, 1000, "failure: " + (t == null ? "unknown" : t.getMessage()));
        }
    }
}
