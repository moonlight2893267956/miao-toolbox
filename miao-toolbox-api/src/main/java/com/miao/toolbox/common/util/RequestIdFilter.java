package com.miao.toolbox.common.util;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter implements Filter {

    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    public static final ThreadLocal<String> REQUEST_ID = new ThreadLocal<>();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        String requestId = UUID.randomUUID().toString();
        REQUEST_ID.set(requestId);
        ((HttpServletResponse) response).setHeader(REQUEST_ID_HEADER, requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            REQUEST_ID.remove();
        }
    }

    public static String currentRequestId() {
        String id = REQUEST_ID.get();
        return id != null ? id : UUID.randomUUID().toString();
    }
}
