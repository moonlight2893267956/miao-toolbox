package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.constant.ErrorCode;

/**
 * SSL 分析过程中的异常，携带统一错误码（与 {@link ErrorCode} 常量一致）。
 */
public class SslAnalyzerException extends Exception {

    private final String errorCode;

    public SslAnalyzerException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public SslAnalyzerException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
