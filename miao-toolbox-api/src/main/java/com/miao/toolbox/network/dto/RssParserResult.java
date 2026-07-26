package com.miao.toolbox.network.dto;

import java.util.List;

/**
 * RSS / Atom 解析器结果：频道元信息 + 文章列表。
 */
public class RssParserResult {

    private RssChannel channel;
    private List<RssItem> items;

    public record RssChannel(String title, String link, String description) {
    }

    public record RssItem(String title, String link, String pubDate, String summary) {
    }

    public RssChannel getChannel() {
        return channel;
    }

    public void setChannel(RssChannel channel) {
        this.channel = channel;
    }

    public List<RssItem> getItems() {
        return items;
    }

    public void setItems(List<RssItem> items) {
        this.items = items;
    }
}
