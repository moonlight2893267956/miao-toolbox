package com.miao.toolbox.network.infrastructure;

/**
 * DNS 解析异常（域名不存在 / 超时 / 解析失败），由 Service 层翻译为对应的业务错误码。
 */
public class DnsResolveException extends Exception {

    public DnsResolveException(String message) {
        super(message);
    }

    public DnsResolveException(String message, Throwable cause) {
        super(message, cause);
    }
}
