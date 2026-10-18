package com.miao.toolbox.observability;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * AiStreamProxy 单元测试。
 *
 * <p><b>为什么用真实 HttpServer 而不是 mock HttpURLConnection</b>：
 * 本类的价值全在传输层语义上 —— 逐行读、EOF 与 IOException 的区别、多行 data
 * 拼接、状态码分支。用 mock 桩出来等于在测 mock 自己。进程内真实 socket 上游
 * 能把这些语义真正跑一遍。
 *
 * <p><b>客户端断开怎么测</b>：{@code SseEmitter.send()} 在未 attach 到真实
 * response 时会缓冲事件而不是抛异常，所以生产里「客户端断开」只能来自真实 send
 * 失败。这正是 {@link AiStreamProxy#newEmitter} 被抽成 protected 的原因 ——
 * 测试注入一个 send 会抛 IOException 的 emitter，本类最重要的那条不变量才有护栏。
 */
@ExtendWith(MockitoExtension.class)
class AiStreamProxyTest {

    @Mock
    private MiaoAiClient miaoAiClient;

    @Mock
    private AiInvocationRecorder.InvocationHandle handle;

    private HttpServer upstream;
    private String baseUrl;
    private AiStreamProxy proxy;

    private final AtomicReference<String> receivedBody = new AtomicReference<>();
    private volatile int upstreamStatus = 200;
    private volatile String upstreamBody = "";
    /** 写完前若干字节就断开连接（模拟中途掐断） */
    private volatile boolean upstreamTruncate = false;
    /** 每次事件之间的间隔，��来让「中途断开」有确定的发生时机 */
    private volatile long eventGapMs = 0;

    /** send 失败几次之后开始抛（模拟客户端在第 N 个事件时断开） */
    private final AtomicInteger sendFailAfter = new AtomicInteger(-1);
    private final AtomicInteger sendCount = new AtomicInteger(0);
    /** 转发线程实际发出的事件 */
    private final List<String> forwarded = new CopyOnWriteArrayList<>();

    @BeforeEach
    void setUp() throws IOException {
        forwarded.clear();
        sendCount.set(0);
        sendFailAfter.set(-1);

        upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        baseUrl = "http://127.0.0.1:" + upstream.getAddress().getPort();

        upstream.createContext("/api/v1/agents/test-agent/invoke/stream", exchange -> {
            receivedBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
            if (upstreamTruncate) {
                exchange.sendResponseHeaders(upstreamStatus, 0);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(normalizeSse(upstreamBody).getBytes(StandardCharsets.UTF_8), 0, 30);
                    os.flush();
                } catch (IOException ignored) {
                    // 上游侧断开，预期内
                }
                exchange.close();
                return;
            }
            byte[] body = normalizeSse(upstreamBody).getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(upstreamStatus, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
                os.flush();
            }
        });
        upstream.start();

        MiaoAiProperties props = new MiaoAiProperties();
        MiaoAiProperties.AgentConfig cfg = new MiaoAiProperties.AgentConfig();
        cfg.setEnabled(true);
        cfg.setBaseUrl(baseUrl);
        cfg.setApiKey("test-key");
        props.getAgents().put("test-agent", cfg);

        when(miaoAiClient.getStreamUrl("test-agent"))
                .thenAnswer(i -> baseUrl + "/api/v1/agents/test-agent/invoke/stream");
        when(miaoAiClient.getStreamHeaders(eq("test-agent"))).thenAnswer(i -> {
            HttpHeaders h = new HttpHeaders();
            h.set("Authorization", "Bearer test-key");
            return h;
        });
        when(miaoAiClient.buildStreamBody(any(), any()))
                .thenAnswer(i -> Map.of("input", i.getArgument(0), "metadata", i.getArgument(1)));
        when(miaoAiClient.recordStreamStart(anyString(), anyString())).thenReturn(handle);

        proxy = new AiStreamProxy(miaoAiClient, props) {
            @Override
            protected SseEmitter newEmitter(long timeoutMs) {
                if (System.getProperty("wt.debug") != null) { /* keep */ }
                // 注入 send 会失败的 emitter，模拟真实客户端断开
                return new SseEmitter(timeoutMs) {
                    @Override
                    public void send(SseEventBuilder builder) throws IOException {
                        int n = sendCount.getAndIncrement();
                        int failAfter = sendFailAfter.get();
                        if (failAfter >= 0 && n >= failAfter) {
                            throw new IOException("模拟客户端断开");
                        }
                        // 用 SseEventBuilder 的**公开** build() 拿真实下发内容。
                        // 不反射私有字段（跨版本易碎），也不依赖 toString（实现类没重写）。
                        StringBuilder sb = new StringBuilder();
                        for (ResponseBodyEmitter.DataWithMediaType part : builder.build()) {
                            sb.append(part.getData());
                        }
                        forwarded.add(sb.toString());
                    }
                };
            }
        };
    }

    /**
     * 规范化测试用 SSE 文本。
     *
     * <p>Java 文本块（{@code """}）会保留公共前导缩进，且结尾只保证一个换行 ——
     * 而 SSE 协议要求<b>空行</b>（两个连续换行）才终止一个事件。直接用文本块当
     * 上游载荷会让最后一个事件永远等不到分隔符，看起来像「代理层漏了 done」，
     * 实则���测试夹具的格式问题。这里统一去缩进并补足尾部空行，
     * 让用例表达的是「代理层行为」而不是「文本块缩进」。
     */
    private static String normalizeSse(String raw) {
        String[] lines = raw.split("\n", -1);
        int minIndent = Integer.MAX_VALUE;
        for (String line : lines) {
            if (!line.isBlank()) {
                minIndent = Math.min(minIndent, line.length() - line.stripLeading().length());
            }
        }
        if (minIndent == Integer.MAX_VALUE) {
            minIndent = 0;
        }
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            sb.append(line.length() >= minIndent ? line.substring(minIndent) : line.stripLeading()).append('\n');
        }
        String out = sb.toString();
        // 保证以空行结尾
        while (!out.endsWith("\n\n")) {
            if (out.endsWith("\n")) {
                out = out + "\n";
                break;
            }
            out = out + "\n\n";
        }
        return out;
    }

    @AfterEach
    void tearDown() {
        if (proxy != null) {
            proxy.shutdown();
        }
        if (upstream != null) {
            upstream.stop(0);
        }
    }

    /**
     * 取回本次调用**实际使用**的记账上下文。
     *
     * <p>必须是生产创建的那一个，而不是新造一个：CAS 守卫活在 Accounting 实例里，
     * 新造一个等于给它一份全新的「未记账」状态，于是两条路径各记一次账 ——
     * 看起来像守卫失效，实则测的根本不是同一次调用。
     * （第一版正是栽在这里：用例显示通过，删掉守卫却依然通过。）
     */
    private AiStreamProxy.Accounting lastAccounting() {
        return proxy.lastAccountingForTest();
    }

    private SseEmitter run(AiStreamProxy.Observer observer) {
        return proxy.proxy(AiStreamProxy.Request.of("test-agent",
                Map.of("task", "explain"), Map.of(), "test-action"), observer);
    }

    private static AiStreamProxy.Observer recordingObserver(List<String> acc) {
        return new AiStreamProxy.Observer() {
            @Override
            public void onEvent(String name, String data, SseEmitter emitter) {
                acc.add(name + ":" + data);
            }
        };
    }

    // ─────────────────── AC1 正常流 + 未知事件透传 ───────────────────

    @Test
    void shouldForwardAllEventsIncludingUnknownOnes() {
        upstreamBody = """
                event:token
                data:{"token":"你好"}

                event:brand_new_event_from_platform
                data:{"whatever":1}

                event:done
                data:{"output":{"ok":true}}
                """;

        List<String> acc = new CopyOnWriteArrayList<>();
        run(recordingObserver(acc));

        verify(miaoAiClient, timeout(5000).times(1))
                .recordStreamSuccess(any(), any(), any(), any(), any(), any(), any(), any());

        assertThat(acc)
                .as("未知事件名必须原样转发 —— miao-ai 契约承诺事件名只增不减")
                .anyMatch(s -> s.startsWith("token:"))
                .anyMatch(s -> s.startsWith("brand_new_event_from_platform:"))
                .anyMatch(s -> s.startsWith("done:"));
        assertThat(forwarded)
                .as("每个事件（含未知事件）都应真的下发给客户端")
                .hasSize(3);
    }

    @Test
    void shouldSendInputInBody() {
        upstreamBody = "event:done\ndata:{}\n\n";

        run(recordingObserver(new CopyOnWriteArrayList<>()));

        verify(miaoAiClient, timeout(5000).times(1))
                .recordStreamSuccess(any(), any(), any(), any(), any(), any(), any(), any());
        assertThat(receivedBody.get()).contains("explain");
    }

    // ─────────────────── AC2 多行 data 按 SSE 规范拼接 ───────────────────

    @Test
    void shouldConcatenateMultiLineData() {
        upstreamBody = """
                event:done
                data:{"output":{
                data:"more":"parts"}}
                """;

        List<String> acc = new CopyOnWriteArrayList<>();
        run(recordingObserver(acc));

        verify(miaoAiClient, timeout(5000).times(1))
                .recordStreamSuccess(any(), any(), any(), any(), any(), any(), any(), any());

        assertThat(acc)
                .as("多行 data: 应拼接成一个载荷后一次性下发")
                .anySatisfy(v -> assertThat(v).startsWith("done:").contains("more"));
        assertThat(forwarded)
                .as("两行 data 应合成**一条**事件下发，而不是两条")
                .hasSize(1);
    }

    // ─────────────────── AC3 成功路径记成功账，且统计正确 ───────────────────

    @Test
    void shouldRecordSuccessOnceAndCountEvents() {
        upstreamBody = "event:token\ndata:{\"token\":\"x\"}\n\nevent:exec\ndata:{}\n\nevent:done\ndata:{}\n\n";

        AtomicReference<AiStreamProxy.StreamStats> captured = new AtomicReference<>();
        run(new AiStreamProxy.Observer() {
            @Override
            public void recordSuccess(AiStreamProxy.StreamStats stats,
                                      AiInvocationRecorder.InvocationHandle h) {
                captured.set(stats);
                // 走注入进来的 client，与生产路径一致
                aiClient().recordStreamSuccess(h, null, null, "tr", null, null, null, "out");
            }
        });

        verify(miaoAiClient, timeout(5000).times(1))
                .recordStreamSuccess(any(), any(), any(), any(), any(), any(), any(), any());
        verify(miaoAiClient, never()).recordStreamFailure(any(), anyString(), anyString());

        assertThat(captured.get().tokenCount()).isEqualTo(1);
        assertThat(captured.get().execCount()).isEqualTo(1);
        assertThat(captured.get().sawDone()).isTrue();
    }

    // ─────────────────── AC4 缺 done = 上游断流（本次修的第二个 Bug） ───────────────────

    @Test
    void shouldTreatMissingDoneAsUpstreamBroken() {
        // 上游正常 EOF，但从未发 done：readLine 返回 null，不抛 IOException。
        // 若不检查，一次失败的调用会被记成成功。
        upstreamBody = "event:token\ndata:{\"token\":\"半截\"}\n\n";

        run(recordingObserver(new CopyOnWriteArrayList<>()));

        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(miaoAiClient, timeout(5000).times(1)).recordStreamFailure(any(), code.capture(), anyString());

        assertThat(code.getValue())
                .as("缺 done 必须记 AI_UPSTREAM_BROKEN，否则失败调用看起来像成功")
                .isEqualTo("AI_UPSTREAM_BROKEN");
        verify(miaoAiClient, never())
                .recordStreamSuccess(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void shouldTreatMidStreamDisconnectAsUpstreamBroken() {
        upstreamTruncate = true;
        upstreamBody = "event:token\ndata:{\"token\":\"半截就断\"}\n\nevent:done\ndata:{}\n\n";

        run(recordingObserver(new CopyOnWriteArrayList<>()));

        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(miaoAiClient, timeout(5000).atLeastOnce())
                .recordStreamFailure(any(), code.capture(), anyString());

        assertThat(code.getAllValues()).contains("AI_UPSTREAM_BROKEN");
    }

    // ─────────────────── AC5 客户端断开 ≠ 上游故障（本次修的第一个 Bug） ───────────────────

    @Test
    void shouldRecordClientGoneAsClientDisconnectedNotUpstreamFailure() {
        upstreamBody = """
                event:token
                data:{"token":"a"}

                event:token
                data:{"token":"b"}

                event:token
                data:{"token":"c"}

                event:done
                data:{}
                """;
        // 第 1 个事件转发成功，之后 send 开始失败 = 用户在读流途中关掉了页面
        sendFailAfter.set(1);

        run(recordingObserver(new CopyOnWriteArrayList<>()));

        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(miaoAiClient, timeout(5000).times(1)).recordStreamFailure(any(), code.capture(), anyString());

        assertThat(code.getValue())
                .as("客户端断开必须记 SSE_CLIENT_DISCONNECTED，绝不能记成上游故障")
                .isEqualTo("SSE_CLIENT_DISCONNECTED");
        assertThat(code.getValue())
                .as("这是本次要修的核心 Bug：过去被归因为用户自己断开，上游故障永不显现")
                .isNotEqualTo("AI_UPSTREAM_BROKEN");
        assertThat(code.getValue()).isNotEqualTo("SSE_PROXY_ERROR");
    }

    @Test
    void shouldRecordOnlyOnceWhenTimeoutCallbackOverlapsWithFailure() throws Exception {
        /*
         * CAS 守卫存在的**唯一理由**就是「两条记账路径会重叠」：
         *   路径 A：转发线程里 upstream 非 2xx → recordStreamFailure
         *   路径 B：emitter 的 onTimeout / onError 回调 → 再次 recordStreamFailure
         * 两者由不同线程触发，AiInvocationRecorder 没有幂等保护，
         * 不加守卫同一次调用会在 ai_invocations 落两条，失败率与耗时分母全部虚高。
         *
         * 单条路径的用例（如 shouldRecordClientGoneAsClientDisconnectedNotUpstreamFailure）
         * **测不出 CAS 是否存在** —— 删掉守卫它照样绿。这里必须手动触发 B。
         */
        upstreamStatus = 500;
        upstreamBody = "{\"error\":\"boom\"}";

        run(recordingObserver(new CopyOnWriteArrayList<>()));
        AiStreamProxy.Accounting accounting = lastAccounting();

        // 等 A 路径（上游非 2xx）先把账记上
        verify(miaoAiClient, timeout(5000).atLeastOnce())
                .recordStreamFailure(any(), anyString(), anyString());

        // 再触发 B：模拟容器的超时回调落在同一个 Accounting 上
        accounting.markTimeout("test-action");

        Thread.sleep(200);

        assertThat(true)
                .as("两条路径叠加时，一次调用只能留下一条记账记录（上面的 times(1) 即断言）")
                .isTrue();
        verify(miaoAiClient, times(1))
                .recordStreamFailure(any(), anyString(), anyString());
    }

    @Test
    void shouldRecordOnlyOnceWhenEmitterErrorOverlapsWithSuccess() throws Exception {
        /*
         * 另一组重叠：成功路径（recordSuccess）与 onError 回调。
         * 没有守卫时 onError 会把一次成功调用改记成失败，失败率虚高。
         */
        upstreamBody = "event:token\ndata:{\"token\":\"a\"}\n\n"
                + "event:done\ndata:{}\n\n";

        run(recordingObserver(new CopyOnWriteArrayList<>()));
        AiStreamProxy.Accounting accounting = lastAccounting();

        verify(miaoAiClient, timeout(5000).times(1))
                .recordStreamSuccess(any(), any(), any(), any(), any(), any(), any(), any());

        // 再触发 B：模拟容器的 onError 回调落在同一个 Accounting 上
        accounting.markEmitterError("test-action", "模拟连接异常");

        Thread.sleep(200);

        // 成功已入账后，随后到达的 onError 不得再记一次失败
        verify(miaoAiClient, never())
                .recordStreamFailure(any(), anyString(), anyString());
    }

    // ─────────────────── AC6 上游非 2xx ───────────────────

    @Test
    void shouldRecordHttpErrorAndNotRecordSuccess() {
        upstreamStatus = 500;
        upstreamBody = "{\"error\":\"agent crashed\"}";

        run(recordingObserver(new CopyOnWriteArrayList<>()));

        verify(miaoAiClient, timeout(5000).times(1)).recordStreamFailure(any(), anyString(), anyString());
        verify(miaoAiClient, never())
                .recordStreamSuccess(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void shouldMapUpstreamStatusToHttpErrorCode() {
        upstreamStatus = 404;
        upstreamBody = "{}";

        run(recordingObserver(new CopyOnWriteArrayList<>()));

        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(miaoAiClient, timeout(5000).times(1)).recordStreamFailure(any(), code.capture(), anyString());

        assertThat(code.getValue())
                .as("上游状态码由 AiUpstreamErrors 统一映射，既有契约是 AI_UPSTREAM_*")
                .isEqualTo("AI_UPSTREAM_404");
    }

    @Test
    void shouldSendErrorEventOnNon2xx() {
        upstreamStatus = 503;
        upstreamBody = "{}";

        run(recordingObserver(new CopyOnWriteArrayList<>()));

        verify(miaoAiClient, timeout(5000).times(1)).recordStreamFailure(any(), anyString(), anyString());
        assertThat(forwarded)
                .as("非 2xx 时必须给客户端一条 error 事件，否则前端只能干等")
                .hasSize(1);
    }

    // ─────────────────── AC7 failFast：agent 未启用时不连上游 ───────────────────

    @Test
    @org.mockito.junit.jupiter.MockitoSettings(strictness = org.mockito.quality.Strictness.LENIENT)
    void shouldFailFastWithoutTouchingUpstream() {
        upstreamStatus = 500;
        upstreamBody = "should never be reached";

        SseEmitter emitter = proxy.failFast("AI_AGENT_DISABLED", "AI 讲解当前不可用", 503);

        assertThat(emitter).isNotNull();
        assertThat(receivedBody.get()).as("fail-fast 不应向上游发任何请求").isNull();
        verify(miaoAiClient, never()).recordStreamStart(anyString(), anyString());
    }

    // ─────────────────── AC8 上游错误体默认不入库 ───────────────────

    @Test
    void shouldKeepUpstreamStatusInFailureMessageButTruncateBody() {
        upstreamStatus = 500;
        upstreamBody = "x".repeat(5000);

        run(recordingObserver(new CopyOnWriteArrayList<>()));

        ArgumentCaptor<String> summary = ArgumentCaptor.forClass(String.class);
        verify(miaoAiClient, timeout(5000).times(1))
                .recordStreamFailure(any(), anyString(), summary.capture());

        assertThat(summary.getValue())
                .as("状态码必须保留（排查靠它定位），错误体按 AiUpstreamErrors 截断")
                .contains("500")
                .hasSizeLessThan(1024);
    }

    // ─────────────────── AC10 错误文案随工具自称变化 ───────────────────

    @Test
    @org.mockito.junit.jupiter.MockitoSettings(strictness = org.mockito.quality.Strictness.LENIENT)
    void defaultServiceLabelIsNeutral() {
        AiStreamProxy.Observer plain = new AiStreamProxy.Observer() {
        };
        assertThat(plain.serviceLabel())
                .as("共享层不该替工具决定它叫什么；忘了覆写时至少不能说成别人的名字")
                .isEqualTo("AI 服务");
    }

    @Test
    void upstreamBreakMessageUsesToolOwnLabel() {
        // 上游正常 EOF 但不发 done = 断流，会给客户端下发一条 error 事件。
        // 文案必须用该工具的自称，而不是共享层的默认值 ——
        // 此前 Cron 里会弹「AI 讲解连接中断」，用户根本不知道这是哪个功能。
        upstreamBody = "event:token\ndata:{\"token\":\"半截\"}\n\n";

        run(new AiStreamProxy.Observer() {
            @Override
            public String serviceLabel() {
                return "Cron AI 助手";
            }
        });

        verify(miaoAiClient, timeout(5000).times(1))
                .recordStreamFailure(any(), anyString(), anyString());

        assertThat(String.join("\n", forwarded))
                .as("断流提示必须带上本工具的自称，不能沿用共享层的默认文案")
                .contains("Cron AI 助手")
                .doesNotContain("AI 讲解");
    }

    // ─────────────────── AC9 suppress() 默认空集 ───────────────────

    @Test
    @org.mockito.junit.jupiter.MockitoSettings(strictness = org.mockito.quality.Strictness.LENIENT)
    void shouldNotSuppressAnythingByDefault() {
        AiStreamProxy.Observer plain = new AiStreamProxy.Observer() {
        };
        assertThat(plain.suppress())
                .as("默认必须全量转发 —— 这是 miao-ai『事件名只增不减』契约的落地点")
                .isEmpty();
    }

    @Test
    void shouldHonourExplicitSuppression() {
        upstreamBody = """
                event:internal_debug
                data:{"leak":"内部细节"}

                event:token
                data:{"token":"a"}

                event:done
                data:{}
                """;

        List<String> acc = new CopyOnWriteArrayList<>();
        run(new AiStreamProxy.Observer() {
            @Override
            public java.util.Set<String> suppress() {
                return java.util.Set.of("internal_debug");
            }

            @Override
            public void onEvent(String name, String data, SseEmitter emitter) {
                acc.add(name + ":" + data);
            }
        });

        verify(miaoAiClient, timeout(5000).times(1))
                .recordStreamSuccess(any(), any(), any(), any(), any(), any(), any(), any());

        assertThat(acc)
                .as("observer 仍会看到被抑制的事件（计数与 done 判定不受影响）")
                .anyMatch(v -> v.startsWith("internal_debug:"));
        assertThat(forwarded)
                .as("被显式抑制的事件不下发，其余照常下发")
                .hasSize(2);
    }
}
