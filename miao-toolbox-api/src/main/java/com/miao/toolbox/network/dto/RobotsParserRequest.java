package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * robots.txt 解析器请求：输入域名；可选 path 用于检查是否允许抓取。
 */
public class RobotsParserRequest {

    @NotBlank(message = "域名不能为空")
    private String domain;

    /** 可选：待检查是否允许抓取的路径（如 /admin）。 */
    private String path;

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }
}
