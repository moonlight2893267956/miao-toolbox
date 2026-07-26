package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Web 抓取器请求：输入目标 URL 与 CSS 选择器，按选择器提取内容。
 */
public class WebScrapeRequest {

    @NotBlank(message = "URL 不能为空")
    private String url;

    @NotBlank(message = "CSS 选择器不能为空")
    private String selector;

    /** 提取模式：text=元素文本，attr=元素指定属性值。默认 text。 */
    private String mode = "text";

    /** 当 mode=attr 时提取的属性名，默认 href。 */
    private String attribute = "href";

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getSelector() {
        return selector;
    }

    public void setSelector(String selector) {
        this.selector = selector;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getAttribute() {
        return attribute;
    }

    public void setAttribute(String attribute) {
        this.attribute = attribute;
    }
}
