package com.miao.toolbox.network.infrastructure;

/**
 * AbuseIPDB 调用异常（携带 HTTP 状态码与详情，便于上层映射为友好提示）。
 */
public class AbuseIpdbException extends RuntimeException {

    private final int status;
    private final String detail;

    public AbuseIpdbException(int status, String detail) {
        super("AbuseIPDB 调用失败: status=" + status + ", detail=" + detail);
        this.status = status;
        this.detail = detail;
    }

    public int getStatus() {
        return status;
    }

    public String getDetail() {
        return detail;
    }
}
