package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Sitemap 解析器请求：输入 sitemap.xml URL（支持 Sitemap Index）。
 */
public class SitemapParserRequest {

    @NotBlank(message = "Sitemap URL 不能为空")
    private String url;

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }
}
