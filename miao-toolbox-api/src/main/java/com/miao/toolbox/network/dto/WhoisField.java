package com.miao.toolbox.network.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * WHOIS 结构化字段（best-effort 解析）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WhoisField {

    private String key;
    private String value;
}
