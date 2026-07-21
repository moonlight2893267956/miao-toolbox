package com.miao.toolbox.network.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * DNS 查询响应。
 */
@Data
@Builder
public class DnsQueryResponse {

    /** 被查询的域名（已 trim） */
    private String domain;

    /** 实际查询的记录类型 */
    private List<String> queryTypes;

    /** 实际使用的 DNS 服务器（如 8.8.8.8:53 或 system-default） */
    private String dnsServer;

    /** 解析得到的记录列表 */
    private List<DnsRecord> records;

    /** 记录总数 */
    private int total;
}
