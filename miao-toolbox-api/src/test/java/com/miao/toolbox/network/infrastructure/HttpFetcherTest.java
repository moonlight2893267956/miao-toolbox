package com.miao.toolbox.network.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.net.InetAddress;
import java.net.UnknownHostException;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * HttpFetcher 必须绕过 JVM 系统代理、直连到经 SSRF 校验后的目标 IP。
 *
 * <p>历史 bug：容器内设置了 HTTPS_PROXY=host.docker.internal:7890，OkHttp 会把请求发往该代理，
 * 自定义 DNS 转而校验「代理主机名」→ 解析为私网 172.17.0.1 → 被 SSRF 误拦，
 * 导致所有外网抓取（含 www.baidu.com）失败。本测试确保 fetch 直连到已校验 IP（不走代理）。
 *
 * <p>注：SsrfProtector 对环回/私网默认拦截，故测试用 permissive 子类把任意主机解析到
 * MockWebServer 监听的 127.0.0.1，仅用于验证「连接直接打到目标 IP 而非代理」。
 */
class HttpFetcherTest {

    private MockWebServer server;
    private HttpFetcher fetcher;

    @BeforeEach
    void setUp() throws Exception {
        server = new MockWebServer();
        server.start();

        SsrfProtector permissive = new SsrfProtector() {
            @Override
            public InetAddress resolveAndValidate(String host) {
                try {
                    // 把任意目标指向 MockWebServer 实际监听地址，绕过默认私网拦截
                    return InetAddress.getByName("127.0.0.1");
                } catch (UnknownHostException e) {
                    throw new RuntimeException(e);
                }
            }
        };
        fetcher = new HttpFetcher(permissive);
    }

    @AfterEach
    void tearDown() throws Exception {
        if (server != null) {
            server.shutdown();
        }
    }

    @Test
    void fetchConnectsDirectlyToValidatedIpWithoutProxy() throws Exception {
        server.enqueue(new MockResponse().setResponseCode(200).setBody("hello"));

        String url = "http://allowed.example.com:" + server.getPort() + "/x";
        var result = fetcher.fetchContent(url, 5000);

        assertEquals(200, result.statusCode());
        assertNotNull(result.body());
        // 若走了代理，请求不会到达 MockWebServer；能收到请求即证明直连生效
        var recorded = server.takeRequest();
        assertNotNull(recorded, "请求应直连到 MockWebServer，而非系统代理");
        assertEquals("/x", recorded.getPath());
    }
}
