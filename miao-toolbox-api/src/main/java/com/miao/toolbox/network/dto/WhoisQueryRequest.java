package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * WHOIS 查询请求。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WhoisQueryRequest {

    /** 目标：域名或 IP 地址 */
    @NotBlank(message = "查询目标不能为空")
    private String target;

    /** 可选：自定义 WHOIS 服务器（host 或 host:port），经 SSRF 校验 */
    private String whoisServer;

    /** 可选：超时毫秒，默认 30000，范围 1000-55000 */
    private Integer timeoutMs;
}
