package com.miao.toolbox.common.exception;

import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.util.RequestIdFilter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDeniedException(AccessDeniedException e) {
        String requestId = RequestIdFilter.currentRequestId();
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("AUTH_UNAUTHORIZED", "权限不足", requestId));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGenericException(Exception e) {
        String requestId = RequestIdFilter.currentRequestId();
        log.error("Unexpected error, requestId={}", requestId, e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("SYSTEM_ERROR", "服务器内部错误", requestId));
    }
}
