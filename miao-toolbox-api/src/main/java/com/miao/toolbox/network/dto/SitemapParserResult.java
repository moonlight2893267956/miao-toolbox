package com.miao.toolbox.network.dto;

import java.util.List;

/**
 * Sitemap 解析器结果：URL 列表 + 是否为 Sitemap Index + 总数。
 */
public class SitemapParserResult {

    private List<SitemapUrl> urls;
    private boolean isIndex;
    private int total;

    public record SitemapUrl(String loc, String lastmod, String priority, String changefreq) {
    }

    public List<SitemapUrl> getUrls() {
        return urls;
    }

    public void setUrls(List<SitemapUrl> urls) {
        this.urls = urls;
    }

    public boolean isIndex() {
        return isIndex;
    }

    public void setIndex(boolean index) {
        isIndex = index;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }
}
