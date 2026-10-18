package com.miao.toolbox.observability;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * AI Agent 流式（SSE）转发 —— 全仓库<b>唯一</b>实现。
 *
 * <h3>为什么需要这一层</h3>
 *
 * 项目对接 miao-ai Agent 平台，每个工具（Cron / Regex / 文本对照 / 五笔）此前都
 * 各自实现了一份 SSE 转发：连接建立、事件解析循环、错误体读取、记账、超时回调。
 * 四份代码的 {@code readErrorBody} 逐字符完全相同，连接段与解析循环也高度重复，
 * 而它们<b>各自演化出了不同的缺陷</b>（见下）。
 *
 * <h3>收敛后的行为口径（以五笔实现为准，它是最晚也最完整的一份）</h3>
 *
 * <ol>
 *   <li><b>不设事件名白名单</b>。miao-ai 的执行事件契约明确承诺「事件名只增不改」，
 *       一旦这里加白名单，平台将来新增事件类型时会被静默丢弃，线上只表现为
 *       「过程轨少了几步」，极难归因。该契约由 miao-ai 侧的
 *       {@code backend/tests/test_invoke_exec_passthrough.py} 钉死。<b>改本类时不要加白名单。</b></li>
 *   <li><b>客户端断开 ≠ 上游断流</b>。前者是用户关页面/取消（高频、非故障），
 *       后者是 miao-ai 侧崩了或连接被掐（真故障）。两者记不同的账：
 *       {@code SSE_CLIENT_DISCONNECTED} vs {@code AI_UPSTREAM_BROKEN}。
 *       混为一谈会让上游故障被归因为「用户自己断开」，该错误码永不出现。</li>
 *   <li><b>没收到 {@code done} 就是断流</b>。上游写出半个事件就断开时，
 *       {@code readLine()} 返回的是正常 EOF（不抛 IOException），不检查就会把
 *       一次失败的调用记成成功，浏览器只收到一个空流。</li>
 *   <li><b>一次调用只记一次账</b>。{@link AiInvocationRecorder} 没有幂等保护，
 *       而 SSE 的失败路径天然重叠（上游非 2xx 先记一次，随后抛异常又进 catch 再记一次；
 *       {@code onTimeout}/{@code onError} 也会与主路径叠加）。用 CAS 守卫兜住。</li>
 * </ol>
 *
 * <h3>与 {@link MiaoAiClient} 的职责边界</h3>
 *
 * <ul>
 *   <li>{@code MiaoAiClient}：<b>怎么调</b> —— URL / 认证头 / 请求体组装 / 同步 invoke /
 *       记账 API。本类不重复这些。</li>
 *   <li>本类：<b>怎么转</b> —— 建立流式连接、按 SSE 规范逐事件转发、区分失败归因、
 *       后台线程与超时。它是<b>唯一的</b> SSE 转发实现。</li>
 * </ul>
 *
 * <h3>工具差异如何容纳</h3>
 *
 * 通过 {@link Observer} 回调：代理层负责它天然知道的事（转发、计数、
 * 是否见到 done、错误归因），工具层只负责只有它知道的事（解析 payload、
 * 记账时带什么字段、会话语义）。计数刻意留在代理层 —— 否则四个工具会
 * 各自重写一遍相同的 token/exec 统计，重复只是从转发层搬到了 observer 层。
 *
 * @see WubiAiStreamService 并发/会话语义的示例用法
 */
@Slf4j
@Component
public class AiStreamProxy {

    /**
     * 默认 emitter 存活上限。
     *
     * <p>取值依据：单次模型调用可阻塞约 70s，miao-ai 最坏耗时实测 ~145s，
     * 给到 200s 留余量。**不要压到 180s 以下**，否则最坏情况会在 agent
     * 尚未返回时先被前端判定超时。
     */
    public static final long DEFAULT_EMITTER_TIMEOUT_MS = 200_000L;

    /**
     * 转发线程池。
     *
     * <p><b>有界</b>而不是 {@code newCachedThreadPool()}：一次调用最长占一个线程
     * ~145s，慢客户端会让线程长时间不释放；无界池在慢客户端多的时候会持续新建
     * 线程把内存吃光。上限 16（单用户交互场景，远够用），队列积压时由调用方
     * 线程执行（{@link ThreadPoolExecutor.CallerRunsPolicy}）——
     * 宁可让创建 emitter 的请求线程多等一会儿，也不要拒绝用户的请求。
     */
    private final ExecutorService sseExecutor = new ThreadPoolExecutor(
            4, 16, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(64),
            new ThreadPoolExecutor.CallerRunsPolicy());

    private final MiaoAiClient miaoAiClient;

    /** 最近一次 proxy 创建的记账上下文，仅供同包测试取回（见 lastAccountingForTest）。 */
    private final java.util.concurrent.atomic.AtomicReference<Accounting> lastAccounting =
            new java.util.concurrent.atomic.AtomicReference<>();

    private final MiaoAiProperties miaoAiProperties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AiStreamProxy(MiaoAiClient miaoAiClient, MiaoAiProperties miaoAiProperties) {
        this.miaoAiClient = miaoAiClient;
        this.miaoAiProperties = miaoAiProperties;
    }

    /**
     * 容器关闭时显式 {@code shutdownNow()}：否则这些 daemon=false 的 worker
     * 会拖住 JVM 退出。
     */
    @PreDestroy
    public void shutdown() {
        sseExecutor.shutdownNow();
    }

    // ─────────────────────────── 公开契约 ───────────────────────────

    /**
     * 一次流式调用的输入。
     *
     * @param agentKey       miao.ai.agents 下的 key（如 {@code wubi-explainer}）
     * @param input          交给 agent 的 {@code input} 载荷（<b>只含契约内的字段</b>）
     * @param metadata       会话等中间层与 agent 的约定数据
     * @param action         日志里的动作名（如 {@code explain-split}），便于定位
     * @param emitterTimeoutMs emitter 存活上限，{@code <= 0} 时用 {@link #DEFAULT_EMITTER_TIMEOUT_MS}
     */
    public record Request(String agentKey,
                          Map<String, Object> input,
                          Map<String, Object> metadata,
                          String action,
                          long emitterTimeoutMs) {

        public static Request of(String agentKey, Map<String, Object> input,
                                 Map<String, Object> metadata, String action) {
            return new Request(agentKey, input, metadata, action, DEFAULT_EMITTER_TIMEOUT_MS);
        }

        public Request withTimeout(long timeoutMs) {
            return new Request(agentKey, input, metadata, action, timeoutMs);
        }

        /**
         * 用**已构建好的完整请求体**转发，跳过代理层的 input/metadata 组装。
         *
         * <p>给那些必须在建流之前就把 {@code input} 与 {@code metadata} 拼好的
         * 调用方用（如五笔：首轮要先建会话拿到 conversation_id 才能定稿）。
         * 这种情况下让代理层再拼一次只会重复劳动，且容易与调用方的组装口径不一致。
         * 约定：{@code metadata} 传 null 即表示「body 已是完整形态」。
         */
        public static Request ofPrebuilt(String agentKey, Map<String, Object> fullBody,
                                         String action, long emitterTimeoutMs) {
            return new Request(agentKey, fullBody, null, action, emitterTimeoutMs);
        }

        long effectiveTimeoutMs() {
            return emitterTimeoutMs > 0 ? emitterTimeoutMs : DEFAULT_EMITTER_TIMEOUT_MS;
        }
    }

    /**
     * 一次流式调用的记账上下文。
     *
     * <p><b>存在的唯一理由：让「一次调用只记一次账」成为结构上的保证</b>。
     * {@link AiInvocationRecorder} 没有幂等保护，而 SSE 的记账路径天然重叠 ——
     * 转发线程的异常分支、emitter 的 {@code onTimeout}、{@code onError}
     * 来自三个不同来源，不加守卫同一次调用会落两条（甚至三条）记录，
     * 失败率与耗时分母全部虚高。
     *
     * <p>做成一个对象而不是把裸 {@link AtomicBoolean} 在方法间传来传去，
     * 是因为<b>守卫必须与记账入口同属一个对象</b>：一旦靠外部"取回守卫"来复用，
     * 很容易取到另一个实例，守卫就形同虚设（第一版测试正是这样骗了自己）。
     * 现在所有记账都必须经过这个对象，守卫也就无处可错。
     */
    final class Accounting {

        private final AiStreamProxy owner;
        private final AiInvocationRecorder.InvocationHandle handle;
        private final AtomicBoolean accounted = new AtomicBoolean(false);

        private Accounting(AiStreamProxy owner, AiInvocationRecorder.InvocationHandle handle) {
            this.owner = owner;
            this.handle = handle;
        }

        /**
         * 同包可见的构造入口，仅供 {@code AiStreamProxyTest} 使用。
         *
         * <p>生产路径里 {@link Accounting} 由 {@link #proxy} 内部创建、从不对外暴露；
         * 测试需要一个「与生产同类型、同行为」的实例来验证多条记账路径重叠时的
         * CAS 守卫，而不是靠外部取回代理内部状态。
         */
        Accounting newForTest(AiInvocationRecorder.InvocationHandle handle) {
            return new Accounting(AiStreamProxy.this, handle);
        }

        AiInvocationRecorder.InvocationHandle handle() {
            return handle;
        }

        /** 记失败。重复调用只有第一次生效。 */
        void markFailure(String code, String summary) {
            if (accounted.compareAndSet(false, true)) {
                owner.miaoAiClient.recordStreamFailure(handle, code, summary);
            }
        }

        /** 记成功。重复调用只有第一次生效；observer 抛异常不影响已转发数据。 */
        void markSuccess(Observer observer, StreamStats stats) {
            if (accounted.compareAndSet(false, true)) {
                try {
                    observer.recordSuccess(stats, handle);
                } catch (Exception e) {
                    log.warn("记录流式调用失败: {}", e.getMessage());
                }
            }
        }

        /** emitter 超时（容器线程调用）。 */
        void markTimeout(String action) {
            log.warn("AI SSE emitter timeout: action={}", action);
            markFailure("SSE_TIMEOUT", "SSE 连接超时");
        }

        /** emitter 异常（容器线程调用）。 */
        void markEmitterError(String action, String message) {
            log.warn("AI SSE emitter error: action={}, {}", action, message);
            markFailure("SSE_ERROR", message);
        }
    }

    /**
     * 工具侧差异回调。
     *
     * <p>代理层已处理转发、计数、失败归因；这里只放「只有该工具知道」的事。
     * 所有方法都有默认实现，工具按需覆写。
     */
    /**
     * 工具侧差异回调。
     *
     * <p>代理层已处理转发、计数、失败归因；这里只放「只有该工具知道」的事。
     * 所有方法都有默认实现，工具按需覆写。
     *
     * <p><b>刻意声明为非静态内部接口</b>：这样实现类天然持有外层 {@code AiStreamProxy}
     * 的引用，可以在默认方法里直接调 {@code miaoAiClient}。若声明成静态接口，
     * 「成功路径必须记账」就只能写成一句口头约定 —— 而它恰恰是最容易被漏掉、
     * 且漏掉后最难察觉（失败率恒为 100%）的一处。
     */
    public abstract static class Observer {

        /**
         * 记账句柄，由 {@link AiStreamProxy#proxy} 在使用前注入。
         *
         * <p>做成抽象类而非接口，就是为了让默认实现能拿到它 ——
         * 「成功路径必须真的记账」因此不必靠每个工具自觉，
         * 也就不会有人漏掉（漏掉的后果是失败率恒为 100%，极难察觉）。
         *
         * <p>每次请求新建一个 observer 实例，注入无并发争用。
         */
        private MiaoAiClient client;

        final void bindClient(MiaoAiClient c) {
            this.client = c;
        }

        /** 记账客户端，由代理层注入 */
        protected MiaoAiClient aiClient() {
            return client;
        }

        /**
         * 收到一个事件（已按 SSE 规范拼好多行 {@code data:}）。转发由代理层完成。
         *
         * <p><b>本方法在代理层转发该事件<i>之后</i>被调用</b>，因此它只适合做
         * 「收到就记一笔」的旁路处理（如逐 token 累加输出）。
         */
        public void onEvent(String name, String data, SseEmitter emitter) {
        }

        /**
         * 收到收尾事件 {@code done}。
         *
         * <p>{@code data} 是<b>原始字符串</b>，代理层不做 JSON 解析 —— 各工具要的
         * 字段不同（模型名 / trace_id / token 数 / 结构化 output），统一解析只会
         * 造出一个「谁都要妥协」的中间结构。
         */
        public void onDone(String data, SseEmitter emitter) {
        }

        /**
         * 声明哪些事件<b>不要</b>转发给客户端。
         *
         * <p>默认返回空集 = <b>全部转发</b>。这条默认值的理由很硬：miao-ai 的执行
         * 事件契约明确承诺「事件名只增不改」，一旦这里默认丢弃未知事件，平台将来
         * 新增事件类型时会被静默吞掉，线上只表现为「过程轨少了几步」，极难归因。
         * 该契约由 miao-ai 侧 {@code backend/tests/test_invoke_exec_passthrough.py} 钉死。
         *
         * <p>因此本方法只应被用于<b>明确的、与契约无关</b>的场景，<b>不要</b>用它来
         * 「过滤掉我不认识的 miao-ai 事件」。
         */
        public java.util.Set<String> suppress() {
            return java.util.Set.of();
        }

        /**
         * 记录一次<b>成功</b>调用。
         *
         * <p><b>默认实现必须真的记账</b>，不能是空实现：成功路径一旦不落库，
         * 观测面板的分母就只含失败，失败率恒为 100%，而这是最难被察觉的一类 bug
         * —— 所有失败路径都「看起来正常」。
         *
         * <p>各工具可覆写以补充 traceId / token 数 / 结构化 output 等专有字段。
         * 已带 CAS 幂等保护：只会在首次记账时进入。
         */
        public void recordSuccess(StreamStats stats,
                                  AiInvocationRecorder.InvocationHandle handle) {
            aiClient().recordStreamSuccess(handle, null, null, null,
                    null, null, null, truncate(String.valueOf(stats.doneData()), 512));
        }

        /**
         * 上游异常时把 HTTP 状态码带来的细节补进记账。
         *
         * <p>默认原样透传 {@link AiUpstreamErrors#messageForStatus} 的结果 ——
         * 它已做截断，且状态码必须保留（日志排查靠它定位）。需要更严格清洗的工具
         * 才覆写它。
         */
        public String enrichFailureMessage(String defaultMessage) {
            return defaultMessage;
        }

        /**
         * 把上游错误码映射为<b>面向前端</b>的业务码（决定下发 {@code event: error} 的 code）。
         *
         * <p>默认不映射，原样下发上游码。工具覆写它时必须与自己的<b>同步</b>路径
         * 用同一份映射 —— 否则会出现「同步返回 410、流式返回别的码」这种前端
         * 无法统一分支的裂缝（前端正是按 code 分支做 410 自动重开会话的）。
         *
         * <p>注意与 {@link #enrichFailureMessage} 的分工：那个只影响<b>入库</b>的摘要，
         * 这个影响<b>下发给客户端</b>的 code。
         */
        public String mapClientErrorCode(String upstreamCode) {
            return upstreamCode;
        }
    }

    /**
     * 转发过程中的统计。
     *
     * <p>刻意放在代理层：数 token / 数 exec / 有没有见到 done，这些是转发层
     * 天然知道的事。四个工具各自重写一遍同样的计数只是把重复换个地方存放。
     *
     * @param sawDone   是否收到过 {@code done}（缺它即断流，见类注释第 3 条）
     * @param tokenCount 收到的 {@code token} 事件数
     * @param execCount 收到的 {@code exec} 事件数
     * @param doneData  {@code done} 事件的原始载荷（可能为 null）
     */
    public record StreamStats(boolean sawDone, int tokenCount, int execCount, String doneData) {
    }

    /**
     * 创建 emitter。
     *
     * <p>抽成方法而非内联 {@code new SseEmitter(...)}，是为了让
     * <b>客户端断开这条路径可测</b>：{@code SseEmitter.send()} 在未 attach
     * 到真实 response 时会把事件<b>缓冲</b>而不是抛异常，所以「客户端已断开」
     * 这个信号在生产里只能来自真实 send 失败。测试必须能注入一个 send 会抛
     * IOException 的 emitter，否则本类最重要的一条不变量
     * （客户端断开记 SSE_CLIENT_DISCONNECTED、绝不记上游故障）就只能靠人肉保证。
     */
    protected SseEmitter newEmitter(long timeoutMs) {
        return new SseEmitter(timeoutMs);
    }

    /**
     * 建 emitter 并在后台线程把上游流逐事件转过去。
     *
     * <p>必须切线程：SSE 读取是阻塞的（{@code BufferedReader.readLine()}），
     * 在请求线程里读会把 Tomcat 工作线程占满整个调用时长。
     */
    public SseEmitter proxy(Request request, Observer observer) {
        /*
         * 先注入记账句柄再启动线程：observer 的默认 recordSuccess 依赖它。
         * 漏了这一步会让**所有成功调用都不落库** —— 不报错、失败路径也「正常」，
         * 但观测面板的失败率会恒为 100%。这是本类最隐蔽的一个坑。
         */
        observer.bindClient(miaoAiClient);

        // 安全上下文必须跨线程传递：转发线程里要读当前用户来记账
        org.springframework.security.core.context.SecurityContext securityContext =
                org.springframework.security.core.context.SecurityContextHolder.getContext();

        SseEmitter emitter = newEmitter(request.effectiveTimeoutMs());

        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(request.agentKey());
        AiInvocationRecorder.InvocationHandle handle = miaoAiClient.recordStreamStart(
                miaoAiProperties.getEffectiveAgentName(request.agentKey()),
                truncate(String.valueOf(request.input()), 512));

        /*
         * !! 一次调用只记一次账 !!
         * 见类注释第 4 条：SSE 的失败路径天然重叠，AiInvocationRecorder 无幂等保护。
         */
        Accounting accounting = new Accounting(this, handle);
        lastAccounting.set(accounting);

        sseExecutor.execute(() -> {
            org.springframework.security.core.context.SecurityContextHolder.setContext(securityContext);
            try {
                doProxy(request, observer, emitter, accounting);
            } finally {
                org.springframework.security.core.context.SecurityContextHolder.clearContext();
            }
        });

        emitter.onTimeout(() -> accounting.markTimeout(request.action()));
        emitter.onError(ex -> accounting.markEmitterError(request.action(), ex.getMessage()));

        return emitter;
    }

    /**
     * 取回最近一次 {@link #proxy} 创建的记账上下文，仅供同包测试使用。
     *
     * <p>生产路径里 {@link Accounting} 从不外泄。测试需要它，是因为「多条记账路径
     * 重叠时只记一次」这条不变量<b>只能在同一个实例上验证</b>：CAS 守卫活在
     * Accounting 里，另造一个等于给它全新的「未记账」状态，两条路径便各记一次 ——
     * 用例看着通过，守卫其实没被测到。
     */
    Accounting lastAccountingForTest() {
        return lastAccounting.get();
    }

    /**
     * 立刻回一条 {@code error} 事件并结束流（不连上游）。
     *
     * <p>用于「agent 未启用」「形校验失败」这类<b>握手前</b>就能定性的失败 ——
     * 让浏览器对着一个空流干等是最糟的失败方式。
     *
     * <p>为什么用 SSE {@code error} 事件而不是 HTTP 4xx：浏览器 {@code fetch} 读到的是
     * 200 + 事件流，前端只需一套「读事件」的解析逻辑就能同时处理成功与业务失败，
     * 不必为「流建立前的失败」再写一条 {@code response.ok} 分支。错误体形状
     * （{@code {code, message}}）与 miao-ai 的 {@code error} 事件一致，前端才能统一处理。
     */
    public SseEmitter failFast(String code, String message, int status) {
        SseEmitter emitter = newEmitter(0L);
        try {
            sendError(emitter, code, message);
            emitter.complete();
        } catch (Exception ignored) {
            // 客户端可能已断开
        }
        log.info("AI SSE fail-fast: code={}, status={}", code, status);
        return emitter;
    }

    // ─────────────────────────── 内部实现 ───────────────────────────

    private void doProxy(Request request, Observer observer, SseEmitter emitter,
                         Accounting accounting) {
        AiInvocationRecorder.InvocationHandle handle = accounting.handle();
        HttpURLConnection conn = null;
        try {
            MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(request.agentKey());

            log.info("AI SSE proxy: connecting, action={}", request.action());
            conn = (HttpURLConnection) URI.create(miaoAiClient.getStreamUrl(request.agentKey()))
                    .toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(agent.getConnectTimeout());
            // 流式读取不设短超时：单次模型调用可阻塞 70s，期间流上可能没有任何事件
            conn.setReadTimeout(0);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", MediaType.TEXT_EVENT_STREAM_VALUE);
            conn.setRequestProperty("Authorization",
                    miaoAiClient.getStreamHeaders(request.agentKey()).getFirst("Authorization"));

            // metadata 为 null 表示调用方已构建好完整 body（五笔：需先建会话再定稿）
            Map<String, Object> body = request.metadata() == null
                    ? request.input()
                    : miaoAiClient.buildStreamBody(request.input(), request.metadata());
            try (OutputStream os = conn.getOutputStream()) {
                os.write(objectMapper.writeValueAsString(body).getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                String errorBody = readErrorBody(conn);
                String code = AiUpstreamErrors.codeForStatus(responseCode);
                String message = observer.enrichFailureMessage(
                        AiUpstreamErrors.messageForStatus(responseCode, errorBody));
                log.error("AI SSE proxy: upstream {} ({}) action={}", responseCode, errorBody, request.action());
                accounting.markFailure(code, truncate(message, 512));
                // 入库存上游码（排查靠它），下发给前端用业务码（前端按此分支处理）
                sendError(emitter, observer.mapClientErrorCode(code), message);
                emitter.complete();
                return;
            }

            StreamStats stats = forwardEvents(conn, emitter, observer, request.action());

            // 没收到 done 就是上游断流，不是正常完成（见类注释第 3 条）
            if (!stats.sawDone()) {
                log.error("AI SSE upstream ended without done: action={}, exec={}, token={}",
                        request.action(), stats.execCount(), stats.tokenCount());
                accounting.markFailure("AI_UPSTREAM_BROKEN", "上游流未以 done 事件结束");
                sendError(emitter, "AI_SERVICE_UNAVAILABLE",
                        "AI 讲解连接中断了，请重试（上游未正常结束）");
                emitter.complete();
                return;
            }

            log.info("AI SSE proxy done: action={}, exec={}, token={}",
                    request.action(), stats.execCount(), stats.tokenCount());
            accounting.markSuccess(observer, stats);
            emitter.complete();

        } catch (UpstreamGoneException upstreamGone) {
            /*
             * 上游断流：miao-ai 侧的问题。要如实告知用户并记故障 ——
             * 静默收尾会让用户以为「AI 讲完了但什么都没说」。
             */
            log.error("AI SSE upstream stream broke: action={}, {}",
                    request.action(), upstreamGone.getMessage());
            accounting.markFailure("AI_UPSTREAM_BROKEN",
                    truncate(upstreamGone.getMessage(), 512));
            sendError(emitter, "AI_SERVICE_UNAVAILABLE",
                    "AI 讲解连接中断了，请重试（上游断流）");
            safeComplete(emitter);

        } catch (ClientGoneException gone) {
            /*
             * 客户端自己断开（关页面 / 取消请求）：**不是故障**。
             * 两个不能省的理由：
             * 1. 记成 SSE_PROXY_ERROR 会让观测面板的失败率虚高 —— 用户关页面是高频操作；
             * 2. 再 sendError 是往已断开的连接写数据，必然 IOException，纯属浪费。
             */
            log.info("AI SSE client gone: action={}", request.action());
            accounting.markFailure("SSE_CLIENT_DISCONNECTED", "客户端断开连接");
            safeComplete(emitter);

        } catch (Exception e) {
            log.error("AI SSE proxy error: action={}, {}", request.action(), e.getMessage(), e);
            accounting.markFailure("SSE_PROXY_ERROR", truncate(e.getMessage(), 512));
            sendError(emitter, "AI_SERVICE_UNAVAILABLE", "AI 讲解服务异常：" + e.getMessage());
            safeComplete(emitter);

        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Exception ignored) {
                    // disconnect 失败不影响已转发的数据
                }
            }
        }
    }

    /**
     * 逐事件转发，并统计 token / exec 数量与 {@code done} 载荷。
     *
     * <p>按 SSE 规范解析：{@code event:} / {@code data:} / 空行分隔；
     * 多行 {@code data:} 拼接后一次性下发。
     *
     * <p><b>未知事件名照样转发</b> —— 这是与 miao-ai 契约对齐的关键（见类注释第 1 条）。
     */
    private StreamStats forwardEvents(HttpURLConnection conn, SseEmitter emitter,
                                      Observer observer, String action)
            throws ClientGoneException, UpstreamGoneException {
        String currentEvent = "";
        StringBuilder currentData = new StringBuilder();
        java.util.Set<String> suppressed = observer.suppress();
        int execCount = 0;
        int tokenCount = 0;
        String doneData = null;
        boolean sawDone = false;

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("event:")) {
                    currentEvent = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                    currentData.append(line.substring(5).trim());
                } else if (line.isEmpty()) {
                    if (currentData.length() > 0) {
                        String data = currentData.toString();
                        // 默认全量转发（suppress() 默认为空集，见 Observer#suppress 注释）
                        if (!suppressed.contains(currentEvent)) {
                            try {
                                emitter.send(SseEmitter.event().name(currentEvent).data(data));
                            } catch (Exception sendEx) {
                                throw new ClientGoneException(sendEx);
                            }
                        }
                        // 计数与 done 判定不受 suppress 影响：它们是记账的依据，不是转发策略
                        switch (currentEvent) {
                            case "exec" -> execCount++;
                            case "token" -> tokenCount++;
                            case "done" -> {
                                sawDone = true;
                                doneData = data;
                                observer.onDone(data, emitter);
                            }
                            default -> {
                                // 未知事件：已转发，交给工具按需处理
                            }
                        }
                        observer.onEvent(currentEvent, data, emitter);
                    }
                    currentEvent = "";
                    currentData.setLength(0);
                }
            }
        } catch (java.io.IOException io) {
            // 读上游失败：与「客户端断开」区分开（见 UpstreamGoneException 注释）
            throw new UpstreamGoneException(io);
        }
        return new StreamStats(sawDone, tokenCount, execCount, doneData);
    }

    /** 往客户端写失败 = **客户端已断开**（关页面 / 取消请求），不是故障。 */
    private static class ClientGoneException extends Exception {
        ClientGoneException(Throwable cause) {
            super(cause);
        }
    }

    /** 读上游失败 = **上游断流**（agent 崩了 / 连接被掐），是真故障。 */
    private static class UpstreamGoneException extends Exception {
        UpstreamGoneException(Throwable cause) {
            super(cause);
        }
    }

    /** 下发 {@code event: error}，载荷形状与 miao-ai 的 error 事件一致。 */
    private void sendError(SseEmitter emitter, String code, String message) {
        try {
            emitter.send(SseEmitter.event().name("error").data(errorPayload(code, message)));
        } catch (Exception e) {
            log.warn("下发 error 事件失败: {}", e.getMessage());
        }
    }

    private String errorPayload(String code, String message) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "code", code == null ? "" : code,
                    "message", message == null ? "AI 服务异常" : message));
        } catch (Exception e) {
            return "{\"code\":\"\",\"message\":\"AI 服务异常\"}";
        }
    }

    /** 客户端可能已断开时安全收尾：失败无可补救，不该再抛。 */
    private void safeComplete(SseEmitter emitter) {
        try {
            emitter.complete();
        } catch (Exception ignored) {
            // 客户端已断开，complete 失败无可补救
        }
    }

    /**
     * 读取上游错误体。
     *
     * <p>全仓库<b>唯一一份</b>实现 —— 此前在 Cron / Regex / 文本对照 / 五笔
     * 四处各抄了一份，逐字符相同。
     */
    private String readErrorBody(HttpURLConnection conn) {
        try (BufferedReader errReader = new BufferedReader(
                new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = errReader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        } catch (Exception e) {
            return "unable to read error body";
        }
    }

    private static String truncate(String text, int maxLength) {
        if (text == null) {
            return null;
        }
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }
}
