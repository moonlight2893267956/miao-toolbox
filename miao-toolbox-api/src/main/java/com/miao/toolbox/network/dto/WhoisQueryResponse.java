package com.miao.toolbox.network.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * WHOIS 查询响应。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WhoisQueryResponse {

    /** 查询目标 */
    private String target;

    /** 目标类型：DOMAIN / IP */
    private String queryType;

    /** 实际使用的 WHOIS 服务器 */
    private String whoisServer;

    /** 结构化字段（注册商、创建时间、过期时间、组织、ASN 等） */
    @Builder.Default
    private List<WhoisField> fields = new ArrayList<>();

    /** 原始 WHOIS 文本 */
    private String raw;

    /** 是否查到记录 */
    private Boolean found;
}
