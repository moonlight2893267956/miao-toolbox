package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import java.net.InetAddress;
import java.net.Proxy;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import okhttp3.Dns;
import okhttp3.Headers;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.stereotype.Component;

/**
 * SSRF 安全的 HTTP 出站客户端。
 *
 * 通过 OkHttp 的 {@link Dns} 接口强制所有请求只解析到经 {@link SsrfProtector}
 * 校验后的单一 IP，从源头杜绝内网/保留地址访问；默认不跟随重定向，
 * 3xx 原样返回给调用方，避免重定向绕过 SSRF 校验。
 *
 * 该客户端显式 {@link Proxy#NO_PROXY} 绕过 JVM 系统代理：用户侧抓取必须直连目标，
 * 否则代理主机名会被误当作目标做 SSRF 校验，且代理侧自行解析目标会削弱防护。
 */
@Slf4j
@Component
public class HttpFetcher {

    /** 工具自身标识，便于目标站点识别来源。 */
    private static final String USER_AGENT = "MiaoToolbox/1.0 (+https://github.com/miao-toolbox)";

    private final SsrfProtector ssrfProtector;
    private final OkHttpClient client;

    public HttpFetcher(SsrfProtector ssrfProtector) {
        this.ssrfProtector = ssrfProtector;
        long connectMs = NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        this.client = new OkHttpClient.Builder()
            .connectTimeout(connectMs, TimeUnit.MILLISECONDS)
            .readTimeout(connectMs, TimeUnit.MILLISECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            // 受 SSRF 防护的用户侧抓取必须直连目标：绕过 JVM 系统代理（如 Clash）。
            // 否则 OkHttp 会把请求发往代理主机（例如 host.docker.internal），
            // 自定义 DNS 会去校验「代理主机名」而非「用户目标」，导致代理地址（私网）被误拦，
            // 且代理侧自行解析目标 IP 会让 SSRF 防护形同虚设。
            .proxy(Proxy.NO_PROXY)
            .dns(this::resolveSafe)
            .build();
    }

    /**
     * 自定义 DNS 解析：对每个 host 只返回经 SSRF 校验后的单一安全 IP。
     * 若 SSRF 校验失败，{@link SsrfProtector#resolveAndValidate} 会直接抛出
     * {@link BusinessException}（RuntimeException），向上传播到全局异常处理器。
     */
    private List<InetAddress> resolveSafe(String hostname) {
        return List.of(ssrfProtector.resolveAndValidate(hostname));
    }

    /** 发起一次 GET 请求并抓取响应头。 */
    public HttpFetchResult fetch(String url, long timeoutMs) {
        return fetch(url, "GET", null, timeoutMs);
    }

    /**
     * 发起指定方法、可带自定义请求头的 HTTP 请求并抓取响应头（SSRF 安全）。
     * 主要用于 CORS 预检（OPTIONS + 自定义 Origin）。仅允许无 body 的方法
     * （GET / HEAD / OPTIONS / TRACE），避免被滥用为写入型探测。
     *
     * @param url          目标 URL（仅 http/https）
     * @param method       HTTP 方法（自动转大写）
     * @param extraHeaders 自定义请求头（可为 null）
     * @param timeoutMs    超时（毫秒），<=0 使用默认
     */
    public HttpFetchResult fetch(String url, String method, Map<String, String> extraHeaders, long timeoutMs) {
        // 预校验 host（SSRF）：直接抛 BusinessException，上抛到 controller 全局异常。
        URI uri = URI.create(url);
        String host = uri.getHost();
        if (host != null && !host.isEmpty()) {
            ssrfProtector.resolveAndValidate(host);
        }
        String upperMethod = method == null || method.isBlank() ? "GET" : method.trim().toUpperCase(java.util.Locale.ROOT);
        if (!Set.of("GET", "HEAD", "OPTIONS", "TRACE").contains(upperMethod)) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT,
                    "仅支持 GET/HEAD/OPTIONS/TRACE 方法", 400);
        }

        long connectMs = timeoutMs > 0 ? timeoutMs : NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        OkHttpClient scoped = client.newBuilder()
            .connectTimeout(connectMs, TimeUnit.MILLISECONDS)
            .readTimeout(connectMs, TimeUnit.MILLISECONDS)
            .build();

        Request.Builder rb = new Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "*/*");
        if (extraHeaders != null) {
            extraHeaders.forEach(rb::header);
        }
        Request request = rb.method(upperMethod, null).build();

        long start = System.nanoTime();
        try (Response response = scoped.newCall(request).execute()) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            Map<String, String> headerMap = new java.util.LinkedHashMap<>();
            Headers headers = response.headers();
            for (String name : headers.names()) {
                headerMap.put(name, headers.get(name));
            }
            return new HttpFetchResult(
                response.code(),
                response.message(),
                response.request().url().toString(),
                headerMap,
                elapsedMs,
                null
            );
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            throw new HttpFetchException("HTTP 请求失败: " + e.getMessage(), e, elapsedMs);
        }
    }

    /**
     * 发起带请求体的 HTTP 请求（SSRF 安全）。用于 GraphQL 代理（POST + JSON body）。
     * 仅允许写入型方法（POST/PUT/PATCH），其余无 body 场景走
     * {@link #fetch(String, String, Map, long)}。同样复用自定义 DNS 做 SSRF 防护，
     * 不跟随重定向，避免重定向绕过校验。
     */
    public HttpFetchResult fetchWithBody(String url, String method, Map<String, String> extraHeaders,
                                         String body, long timeoutMs) {
        URI uri = URI.create(url);
        String host = uri.getHost();
        if (host != null && !host.isEmpty()) {
            ssrfProtector.resolveAndValidate(host);
        }
        String upperMethod = method == null || method.isBlank() ? "POST"
                : method.trim().toUpperCase(java.util.Locale.ROOT);
        if (!Set.of("POST", "PUT", "PATCH").contains(upperMethod)) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "仅支持 POST/PUT/PATCH 方法", 400);
        }
        long connectMs = timeoutMs > 0 ? timeoutMs : NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        OkHttpClient scoped = client.newBuilder()
            .connectTimeout(connectMs, TimeUnit.MILLISECONDS)
            .readTimeout(connectMs, TimeUnit.MILLISECONDS)
            .build();
        okhttp3.MediaType jsonType = okhttp3.MediaType.parse("application/json");
        okhttp3.RequestBody reqBody = body == null
                ? okhttp3.RequestBody.create("", jsonType)
                : okhttp3.RequestBody.create(body, jsonType);
        Request.Builder rb = new Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "application/json");
        if (extraHeaders != null) {
            extraHeaders.forEach(rb::header);
        }
        Request request = rb.method(upperMethod, reqBody).build();
        long start = System.nanoTime();
        try (Response response = scoped.newCall(request).execute()) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            Map<String, String> headerMap = new java.util.LinkedHashMap<>();
            Headers headers = response.headers();
            for (String name : headers.names()) {
                headerMap.put(name, headers.get(name));
            }
            String respBody = "";
            try {
                if (response.body() != null) {
                    respBody = response.body().string();
                }
            } catch (Exception ignored) {
                // 读取响应体失败时不影响状态码/响应头返回
            }
            return new HttpFetchResult(
                response.code(),
                response.message(),
                response.request().url().toString(),
                headerMap,
                elapsedMs,
                respBody
            );
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            throw new HttpFetchException("HTTP 请求失败: " + e.getMessage(), e, elapsedMs);
        }
    }

    /**
     * 发起 GET 请求并读取响应体（SSRF 安全，但跳过 TLS 证书校验）。
     *
     * <p>仅用于极少数公开站点（如 doutula.com）其证书不被运行环境 JVM 信任库信任、
     * 导致 {@link #fetchContent} 报 PKIX 错误的兜底场景。SSRF 预校验与 DNS 锁定仍然生效，
     * 仅放宽证书校验，不会访问内网/保留地址。该方法不复用全局 client，需要临时构建一个
     * 信任所有证书的 OkHttpClient（不跟随重定向）。
     */
    public HttpFetchResult fetchContentInsecure(String url, long timeoutMs) {
        URI uri = URI.create(url);
        String host = uri.getHost();
        if (host != null && !host.isEmpty()) {
            ssrfProtector.resolveAndValidate(host); // SSRF 校验仍然生效
        }
        long connectMs = timeoutMs > 0 ? timeoutMs : NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        OkHttpClient insecureClient = client.newBuilder()
            .connectTimeout(connectMs, TimeUnit.MILLISECONDS)
            .readTimeout(connectMs, TimeUnit.MILLISECONDS)
            .sslSocketFactory(InsecureTrustManager.trustAllSslSocketFactory(),
                InsecureTrustManager.TRUST_ALL_MANAGER)
            .hostnameVerifier((h, s) -> true)
            .build();
        Request request = new Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "*/*")
            .get()
            .build();
        long start = System.nanoTime();
        try (Response response = insecureClient.newCall(request).execute()) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            Map<String, String> headerMap = new java.util.LinkedHashMap<>();
            Headers headers = response.headers();
            for (String name : headers.names()) {
                headerMap.put(name, headers.get(name));
            }
            String body = "";
            try {
                if (response.body() != null) {
                    body = response.body().string();
                }
            } catch (Exception ignored) {
                // 读取响应体失败时不影响状态码/响应头返回
            }
            return new HttpFetchResult(
                response.code(),
                response.message(),
                response.request().url().toString(),
                headerMap,
                elapsedMs,
                body
            );
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            throw new HttpFetchException("HTTP 请求失败: " + e.getMessage(), e, elapsedMs);
        }
    }

    /**
     * 发起 GET 请求并读取响应体（SSRF 安全）。用于 Web 抓取 / RSS / Sitemap / robots.txt
     * 等需要页面正文的只读代理场景。沿用与 {@link #fetch} 相同的 SSRF 预校验与超时控制，
     * 不跟随重定向（避免绕过校验）。
     */
    public HttpFetchResult fetchContent(String url, long timeoutMs) {
        URI uri = URI.create(url);
        String host = uri.getHost();
        if (host != null && !host.isEmpty()) {
            ssrfProtector.resolveAndValidate(host);
        }
        long connectMs = timeoutMs > 0 ? timeoutMs : NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        OkHttpClient scoped = client.newBuilder()
            .connectTimeout(connectMs, TimeUnit.MILLISECONDS)
            .readTimeout(connectMs, TimeUnit.MILLISECONDS)
            .build();
        Request request = new Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "*/*")
            .get()
            .build();
        long start = System.nanoTime();
        try (Response response = scoped.newCall(request).execute()) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            Map<String, String> headerMap = new java.util.LinkedHashMap<>();
            Headers headers = response.headers();
            for (String name : headers.names()) {
                headerMap.put(name, headers.get(name));
            }
            String body = "";
            try {
                if (response.body() != null) {
                    body = response.body().string();
                }
            } catch (Exception ignored) {
                // 读取响应体失败时不影响状态码/响应头返回
            }
            return new HttpFetchResult(
                response.code(),
                response.message(),
                response.request().url().toString(),
                headerMap,
                elapsedMs,
                body
            );
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            throw new HttpFetchException("HTTP 请求失败: " + e.getMessage(), e, elapsedMs);
        }
    }

    /** HTTP 抓取结果。 */
    public record HttpFetchResult(
        int statusCode,
        String statusText,
        String finalUrl,
        Map<String, String> headers,
        long elapsedMs,
        String body
    ) {}

    /** 抓取异常（携带已耗时，便于上层映射）。 */
    public static class HttpFetchException extends RuntimeException {
        private final long elapsedMs;

        public HttpFetchException(String message, Throwable cause, long elapsedMs) {
            super(message, cause);
            this.elapsedMs = elapsedMs;
        }

        public long getElapsedMs() {
            return elapsedMs;
        }
    }
}
