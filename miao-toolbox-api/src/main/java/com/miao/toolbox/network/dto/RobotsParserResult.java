package com.miao.toolbox.network.dto;

import java.util.List;

/**
 * robots.txt 解析器结果：规则分组 + Sitemap 链接；若提供 path 则给出是否允许。
 */
public class RobotsParserResult {

    private List<RobotsGroup> groups;
    private List<String> sitemaps;
    /** 仅当请求带 path 时有值。 */
    private Boolean pathAllowed;
    private String matchedRule;

    public record RobotsGroup(String userAgent, List<String> allow, List<String> disallow) {
    }

    public List<RobotsGroup> getGroups() {
        return groups;
    }

    public void setGroups(List<RobotsGroup> groups) {
        this.groups = groups;
    }

    public List<String> getSitemaps() {
        return sitemaps;
    }

    public void setSitemaps(List<String> sitemaps) {
        this.sitemaps = sitemaps;
    }

    public Boolean getPathAllowed() {
        return pathAllowed;
    }

    public void setPathAllowed(Boolean pathAllowed) {
        this.pathAllowed = pathAllowed;
    }

    public String getMatchedRule() {
        return matchedRule;
    }

    public void setMatchedRule(String matchedRule) {
        this.matchedRule = matchedRule;
    }
}
