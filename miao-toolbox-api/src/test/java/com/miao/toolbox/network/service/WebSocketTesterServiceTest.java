package com.miao.toolbox.network.service;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.WebSocketConnectRequest;
import com.miao.toolbox.network.dto.WebSocketDisconnectRequest;
import com.miao.toolbox.network.dto.WebSocketSendRequest;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import java.net.InetAddress;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WebSocketTesterServiceTest {

    @Mock
    private SsrfProtector ssrfProtector;

    private WebSocketTesterService service;
    private MockWebServer server;

    @BeforeEach
    void setUp() throws Exception {
        server = new MockWebServer();
        server.start();
        // 测试环境放行所有 host（指向本地回环，供 MockWebServer 使用）
        when(ssrfProtector.resolveAndValidate(anyString())).thenReturn(InetAddress.getByName("127.0.0.1"));
        service = new WebSocketTesterService(ssrfProtector);
    }

    @AfterEach
    void tearDown() {
        try {
            server.shutdown();
        } catch (Exception ignored) {
            // 连接可能尚未完全关闭，忽略 shutdown 等待超时
        }
    }

    @Test
    void invalidScheme_rejected() {
        WebSocketConnectRequest req = new WebSocketConnectRequest();
        req.setUrl("http://example.com");
        assertThrows(BusinessException.class, () -> service.connect(req));
    }

    @Test
    void ssrfBlocked_rejected() {
        when(ssrfProtector.resolveAndValidate(anyString()))
                .thenThrow(new BusinessException("NETWORK_SSRF_BLOCKED", "blocked", 403));
        WebSocketConnectRequest req = new WebSocketConnectRequest();
        req.setUrl("ws://127.0.0.1/x");
        assertThrows(BusinessException.class, () -> service.connect(req));
    }

    @Test
    void connectAndEcho() throws Exception {
        AtomicReference<WebSocket> serverWs = new AtomicReference<>();
        CountDownLatch received = new CountDownLatch(1);
        server.enqueue(new MockResponse().withWebSocketUpgrade(new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                serverWs.set(webSocket);
                webSocket.send("echo");
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                if ("ping".equals(text)) {
                    received.countDown();
                }
            }
        }));

        WebSocketConnectRequest req = new WebSocketConnectRequest();
        req.setUrl(wsUrl());
        String sid = service.connect(req);
        assertNotNull(sid);
        assertNotNull(server.takeRequest(5, TimeUnit.SECONDS));

        WebSocketSendRequest sendReq = new WebSocketSendRequest();
        sendReq.setSessionId(sid);
        sendReq.setMessage("ping");
        service.send(sendReq);

        assertTrue(received.await(5, TimeUnit.SECONDS));

        WebSocketDisconnectRequest discReq = new WebSocketDisconnectRequest();
        discReq.setSessionId(sid);
        service.disconnect(discReq);
    }

    private String wsUrl() {
        return server.url("/").toString().replace("http", "ws");
    }
}
