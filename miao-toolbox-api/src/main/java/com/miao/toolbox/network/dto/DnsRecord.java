package com.miao.toolbox.network.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 单条 DNS 记录。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DnsRecord {

    /** 记录归属的域名（含子名，如 www.example.com.） */
    private String name;

    /** 记录类型，如 A / AAAA / CNAME / MX / TXT / NS / SOA / PTR */
    private String type;

    /** 生存时间（秒） */
    private Long ttl;

    /** 解析得到的记录值 */
    private String value;
}
