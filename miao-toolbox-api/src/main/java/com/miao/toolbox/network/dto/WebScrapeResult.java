package com.miao.toolbox.network.dto;

import java.util.List;

/**
 * Web 抓取器结果：选择器命中的所有匹配项。
 */
public class WebScrapeResult {

    private List<WebScrapeMatch> matches;
    private String mode;
    private int total;

    public record WebScrapeMatch(String text, String attrValue) {
    }

    public List<WebScrapeMatch> getMatches() {
        return matches;
    }

    public void setMatches(List<WebScrapeMatch> matches) {
        this.matches = matches;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }
}
