package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * DNS 查询请求。
 */
@Data
public class DnsQueryRequest {

    @NotBlank(message = "域名不能为空")
    @Size(max = 253, message = "域名过长")
    private String domain;

    /**
     * 记录类型列表，默认 [A, AAAA]（双栈）。
     * 支持：A / AAAA / CNAME / MX / TXT / NS / SOA / PTR
     */
    private List<String> types;

    /** 可选自定义 DNS 服务器 host[:port]，默认走系统解析器 */
    private String dnsServer;

    /** 查询超时（毫秒），默认 10000，范围 1000–30000 */
    private Integer timeoutMs;
}
