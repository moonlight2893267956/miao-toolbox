package com.miao.toolbox.gateway.filter;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * 可重复读取 body 的 HttpServletRequest 包装器。
 *
 * <p>标准 Servlet InputStream 只能读一次；如果在过滤器中读取了 body（用于签名验证），
 * 后续 Controller 的 {@code @RequestBody} 将拿不到内容。本包装器在构造时一次性
 * 把 body 缓存到内存字节数组，后续 {@link #getInputStream()} 每次返回新的
 * {@link ByteArrayInputStream}，使 body 可被多个 filter/Controller 重复消费。
 */
public class CachedBodyHttpServletRequest extends HttpServletRequestWrapper {

    private final byte[] cachedBody;

    public CachedBodyHttpServletRequest(HttpServletRequest request) throws java.io.IOException {
        super(request);
        this.cachedBody = request.getInputStream().readAllBytes();
    }

    public String getBodyAsString() {
        return new String(cachedBody, StandardCharsets.UTF_8);
    }

    @Override
    public ServletInputStream getInputStream() {
        ByteArrayInputStream buffer = new ByteArrayInputStream(cachedBody);
        return new ServletInputStream() {
            @Override
            public boolean isFinished() {
                return buffer.available() == 0;
            }

            @Override
            public boolean isReady() {
                return true;
            }

            @Override
            public void setReadListener(ReadListener readListener) {
                throw new UnsupportedOperationException();
            }

            @Override
            public int read() {
                return buffer.read();
            }
        };
    }

    @Override
    public BufferedReader getReader() {
        return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
    }
}
