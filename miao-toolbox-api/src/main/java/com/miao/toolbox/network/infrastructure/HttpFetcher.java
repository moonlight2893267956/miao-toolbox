package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.exception.BusinessException;
import java.net.InetAddress;
import java.net.URI;
import java.util.List;
import java.util.Map;
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
        // 预校验 host（SSRF）：直接抛 BusinessException，上抛到 controller 全局异常。
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
            .build();

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
                elapsedMs
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
        long elapsedMs
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
