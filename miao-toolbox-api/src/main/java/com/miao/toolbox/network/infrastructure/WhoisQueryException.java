package com.miao.toolbox.network.infrastructure;

/**
 * WHOIS 查询异常：连接/超时/协议层错误统一包装，并携带对应的错误码字符串以便上层精确映射。
 */
public class WhoisQueryException extends Exception {

    private final String errorCode;

    public WhoisQueryException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public WhoisQueryException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
