package com.miao.toolbox.common.exception;

import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.util.RequestIdFilter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException e) {
        String requestId = RequestIdFilter.currentRequestId();
        log.warn("Business exception: code={}, message={}, requestId={}", e.getErrorCode(), e.getMessage(), requestId);
        return ResponseEntity.status(e.getHttpStatus())
                .body(ApiResponse.error(e.getErrorCode(), e.getMessage(), requestId));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationException(MethodArgumentNotValidException e) {
        String requestId = RequestIdFilter.currentRequestId();
        String errors = e.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .collect(Collectors.joining("; "));
        log.warn("Validation failed: {}, requestId={}", errors, requestId);
        return ResponseEntity.badRequest()
                .body(ApiResponse.error("VALIDATION_FAILED", errors, requestId));
    }

    // #15: 处理请求体解析异常
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleHttpMessageNotReadableException(HttpMessageNotReadableException e) {
        String requestId = RequestIdFilter.currentRequestId();
        log.warn("Malformed request body: {}, requestId={}", e.getMessage(), requestId);
        return ResponseEntity.badRequest()
                .body(ApiResponse.error("VALIDATION_FAILED", "请求体格式错误", requestId));
    }

    // #15: 处理缺少必需请求参数
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingServletRequestParameterException(MissingServletRequestParameterException e) {
        String requestId = RequestIdFilter.currentRequestId();
        log.warn("Missing request parameter: {}, requestId={}", e.getParameterName(), requestId);
        return ResponseEntity.badRequest()
                .body(ApiResponse.error("VALIDATION_FAILED", "缺少必需参数: " + e.getParameterName(), requestId));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDeniedException(AccessDeniedException e) {
        String requestId = RequestIdFilter.currentRequestId();
        // #26: 记录权限拒绝日志
        log.warn("Access denied, requestId={}", requestId);
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("AUTH_UNAUTHORIZED", "权限不足", requestId));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResourceFoundException(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("NOT_FOUND", "资源不存在", null));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGenericException(Exception e) {
        String requestId = RequestIdFilter.currentRequestId();
        log.error("Unexpected error, requestId={}", requestId, e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("SYSTEM_ERROR", "服务器内部错误", requestId));
    }
}
