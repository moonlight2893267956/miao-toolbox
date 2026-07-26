package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * RSS / Atom 解析器请求：输入 Feed URL。
 */
public class RssParserRequest {

    @NotBlank(message = "Feed URL 不能为空")
    private String url;

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }
}
