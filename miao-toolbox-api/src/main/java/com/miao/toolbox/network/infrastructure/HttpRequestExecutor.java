package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import javax.net.ssl.SSLException;
import lombok.extern.slf4j.Slf4j;
import okhttp3.Dns;
import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;
import org.springframework.stereotype.Component;

/**
 * SSRF 安全的 HTTP 出站执行器：支持任意 HTTP 方法、自定义请求头与请求体，
 * 作为「HTTP 请求构建器」的服务端代理核心。
 *
 * <p>与 {@link HttpFetcher} 同样通过 OkHttp 的 {@link Dns} 接口强制所有请求只解析到
 * 经 {@link SsrfProtector} 校验后的单一安全 IP，从源头杜绝内网/保留地址访问；
 * 默认不跟随重定向，3xx 原样返回。
 */
@Slf4j
@Component
public class HttpRequestExecutor {

    /** 响应体读取上限（5MB），超出截断，避免大响应撑爆内存。 */
    private static final long MAX_BODY_BYTES = 5_000_000L;

    /** 工具自身标识。 */
    private static final String USER_AGENT = "MiaoToolbox/1.0 (+https://github.com/miao-toolbox)";

    /**
     * 禁止用户直接设置的请求头：这些由 OkHttp 托管或存在安全隐患（hop-by-hop / 代理相关）。
     * Content-Type 由请求体类型推导托管；Accept-Encoding 由 OkHttp 透明处理 gzip。
     */
    private static final Set<String> FORBIDDEN_REQUEST_HEADERS = Set.of(
        "host", "connection", "content-length", "transfer-encoding", "upgrade",
        "proxy-authorization", "proxy-authenticate", "te", "trailers", "keep-alive",
        "accept-encoding", "content-type"
    );

    /** 允许通过代理转发的方法（排除 CONNECT 等可构成代理跳板的危险方法）。 */
    private static final Set<String> ALLOWED_METHODS = Set.of(
        "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"
    );

    private final SsrfProtector ssrfProtector;
    private final OkHttpClient baseClient;

    public HttpRequestExecutor(SsrfProtector ssrfProtector) {
        this.ssrfProtector = ssrfProtector;
        long ms = NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        this.baseClient = new OkHttpClient.Builder()
            .connectTimeout(Duration.ofMillis(ms))
            .readTimeout(Duration.ofMillis(ms))
            .followRedirects(false)
            .followSslRedirects(false)
            .dns(this::resolveSafe)
            .build();
    }

    /** 一次代理请求的规格。 */
    public record Spec(
        String url,
        String method,
        List<Header> headers,
        String bodyType,
        String body,
        int timeoutMs
    ) {}

    /** 单个请求头（执行器内部使用，与 DTO 解耦）。 */
    public record Header(String name, String value) {}

    /** 一次代理执行的结果。 */
    public record Execution(
        int statusCode,
        String statusText,
        String finalUrl,
        List<Header> headers,
        String body,
        long bodyBytes,
        boolean truncated,
        long elapsedMs
    ) {}

    /**
     * 发起一次代理请求。
     * 任何网络层 / SSRF / 校验异常都会转换为 {@link BusinessException} 向上传播，
     * 由 Service 统一做友好降级。
     */
    public Execution send(Spec spec) {
        String url = spec.url();
        if (url == null || url.isBlank()) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "URL 不能为空");
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "仅支持 http/https 协议");
        }

        String host = extractHost(url);
        if (host != null && !host.isEmpty()) {
            ssrfProtector.resolveAndValidate(host);
        }

        String method = normalizeMethod(spec.method());
        if (!ALLOWED_METHODS.contains(method)) {
            throw new BusinessException(ErrorCode.NETWORK_INVALID_INPUT, "不支持的 HTTP 方法：" + method);
        }

        long timeoutMs = spec.timeoutMs() > 0 ? spec.timeoutMs() : NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        OkHttpClient client = baseClient.newBuilder()
            .connectTimeout(Duration.ofMillis(timeoutMs))
            .readTimeout(Duration.ofMillis(timeoutMs))
            .build();

        Request.Builder rb = new Request.Builder().url(url);
        boolean hasUserAgent = false;
        if (spec.headers() != null) {
            for (Header h : spec.headers()) {
                if (h.name() == null || h.name().isBlank()) {
                    continue;
                }
                String lower = h.name().toLowerCase(Locale.ROOT);
                if (FORBIDDEN_REQUEST_HEADERS.contains(lower)) {
                    continue;
                }
                rb.addHeader(h.name(), h.value() == null ? "" : h.value());
                if ("user-agent".equals(lower)) {
                    hasUserAgent = true;
                }
            }
        }
        if (!hasUserAgent) {
            rb.addHeader("User-Agent", USER_AGENT);
        }

        RequestBody body = buildBody(spec);
        if (isBodyAllowed(method)) {
            rb.method(method, body == null ? RequestBody.create(new byte[0], null) : body);
        } else {
            rb.method(method, null);
        }

        long start = System.nanoTime();
        try (Response response = client.newCall(rb.build()).execute()) {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            return mapResponse(response, elapsedMs);
        } catch (BusinessException e) {
            throw e;
        } catch (UnknownHostException e) {
            throw new BusinessException(ErrorCode.NETWORK_DNS_RESOLVE_FAILED, "无法解析主机：" + host);
        } catch (SocketTimeoutException e) {
            throw new BusinessException(ErrorCode.NETWORK_CONNECTION_TIMEOUT, "请求超时（" + timeoutMs + "ms）");
        } catch (SSLException e) {
            throw new BusinessException(ErrorCode.NETWORK_SSL_HANDSHAKE_FAILED, "SSL/TLS 握手失败：" + e.getMessage());
        } catch (java.io.IOException e) {
            throw new BusinessException(ErrorCode.NETWORK_HTTP_FETCH_FAILED, "请求失败：" + e.getMessage());
        }
    }

    private Execution mapResponse(Response response, long elapsedMs) throws java.io.IOException {
        Headers respHeaders = response.headers();
        List<Header> headers = new ArrayList<>();
        for (String name : respHeaders.names()) {
            for (String value : respHeaders.values(name)) {
                headers.add(new Header(name, value));
            }
        }

        String body = null;
        long bodyBytes = 0;
        boolean truncated = false;
        ResponseBody respBody = response.body();
        if (respBody != null) {
            Charset charset = (respBody.contentType() != null && respBody.contentType().charset() != null)
                ? respBody.contentType().charset()
                : StandardCharsets.UTF_8;
            BufferedSource source = respBody.source();
            Buffer buffer = new Buffer();
            long read = source.read(buffer, MAX_BODY_BYTES);
            truncated = read >= MAX_BODY_BYTES && !source.exhausted();
            long size = read < 0 ? 0 : read;
            body = size == 0 ? "" : buffer.readString(charset);
            long declared = respBody.contentLength();
            bodyBytes = declared > 0 ? declared : size;
        }

        return new Execution(
            response.code(),
            response.message(),
            response.request().url().toString(),
            headers,
            body,
            bodyBytes,
            truncated,
            elapsedMs
        );
    }

    private RequestBody buildBody(Spec spec) {
        if (spec.body() == null || spec.body().isBlank()) {
            return null;
        }
        MediaType mt = switch (spec.bodyType() == null ? "raw" : spec.bodyType().toLowerCase(Locale.ROOT)) {
            case "json" -> MediaType.parse("application/json; charset=utf-8");
            case "form" -> MediaType.parse("application/x-www-form-urlencoded; charset=utf-8");
            default -> MediaType.parse("text/plain; charset=utf-8");
        };
        return RequestBody.create(spec.body(), mt);
    }

    private boolean isBodyAllowed(String method) {
        return !Set.of("GET", "HEAD").contains(method);
    }

    private String normalizeMethod(String method) {
        if (method == null || method.isBlank()) {
            return "GET";
        }
        return method.trim().toUpperCase(Locale.ROOT);
    }

    private String extractHost(String url) {
        try {
            URI uri = new URI(url);
            return uri.getHost();
        } catch (Exception e) {
            return null;
        }
    }

    private List<InetAddress> resolveSafe(String hostname) {
        return List.of(ssrfProtector.resolveAndValidate(hostname));
    }
}
