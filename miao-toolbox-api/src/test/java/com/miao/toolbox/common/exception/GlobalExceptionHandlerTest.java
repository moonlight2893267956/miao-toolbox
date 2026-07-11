package com.miao.toolbox.common.exception;

import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.util.RequestIdFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;

import org.apache.catalina.connector.ClientAbortException;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import java.io.IOException;

import static org.assertj.core.api.Assertions.*;

@DisplayName("GlobalExceptionHandler 单元测试")
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    @DisplayName("BusinessException → 对应 HTTP 状态码 + 错误码")
    void handleBusinessException() {
        BusinessException ex = new BusinessException("VALIDATION_FAILED", "参数校验失败", 400);

        ResponseEntity<ApiResponse<Void>> response = handler.handleBusinessException(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo("VALIDATION_FAILED");
        assertThat(response.getBody().getMessage()).isEqualTo("参数校验失败");
    }

    @Test
    @DisplayName("AuthException(401) → 401 状态码")
    void handleAuthException() {
        AuthException ex = AuthException.loginFailed();

        ResponseEntity<ApiResponse<Void>> response = handler.handleBusinessException(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody().getCode()).isEqualTo("AUTH_LOGIN_FAILED");
    }

    @Test
    @DisplayName("AccessDeniedException → 403 + AUTH_UNAUTHORIZED")
    void handleAccessDeniedException() {
        ResponseEntity<ApiResponse<Void>> response = handler.handleAccessDeniedException(
                new org.springframework.security.access.AccessDeniedException("denied"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody().getCode()).isEqualTo("AUTH_UNAUTHORIZED");
    }

    @Test
    @DisplayName("HttpMessageNotReadableException → 400 + VALIDATION_FAILED")
    void handleHttpMessageNotReadableException() {
        ResponseEntity<ApiResponse<Void>> response = handler.handleHttpMessageNotReadableException(
                new HttpMessageNotReadableException("Bad JSON", (org.springframework.http.HttpInputMessage) null));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().getCode()).isEqualTo("VALIDATION_FAILED");
        assertThat(response.getBody().getMessage()).contains("请求体格式错误");
    }

    @Test
    @DisplayName("AsyncRequestNotUsableException / ClientAbortException → 503 + REQUEST_ABORTED，不记为未捕获 ERROR")
    void handleClientAbortException() {
        ResponseEntity<ApiResponse<Void>> asyncResp = handler.handleClientAbortException(
                new AsyncRequestNotUsableException("ServletResponse failed to flushBuffer",
                        new IOException("Broken pipe")));

        assertThat(asyncResp.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(asyncResp.getBody()).isNotNull();
        assertThat(asyncResp.getBody().getCode()).isEqualTo("REQUEST_ABORTED");

        ResponseEntity<ApiResponse<Void>> clientResp = handler.handleClientAbortException(
                new ClientAbortException(new IOException("Broken pipe")));

        assertThat(clientResp.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(clientResp.getBody().getCode()).isEqualTo("REQUEST_ABORTED");
    }

    @Test
    @DisplayName("通用 Exception → 500 + SYSTEM_ERROR（不泄露内部细节）")
    void handleGenericException() {
        ResponseEntity<ApiResponse<Void>> response = handler.handleGenericException(
                new RuntimeException("Database connection failed: jdbc:mysql://internal-host:3306"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().getCode()).isEqualTo("SYSTEM_ERROR");
        // 不泄露内部错误细节
        assertThat(response.getBody().getMessage()).isEqualTo("服务器内部错误");
        assertThat(response.getBody().getMessage()).doesNotContain("Database");
        assertThat(response.getBody().getMessage()).doesNotContain("jdbc");
    }

    @Test
    @DisplayName("BusinessException(500) → SYSTEM_ERROR 不泄露")
    void systemErrorBusinessException() {
        BusinessException ex = new BusinessException("SYSTEM_ERROR", "服务器内部错误", 500);
        ResponseEntity<ApiResponse<Void>> response = handler.handleBusinessException(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().getCode()).isEqualTo("SYSTEM_ERROR");
    }
}
