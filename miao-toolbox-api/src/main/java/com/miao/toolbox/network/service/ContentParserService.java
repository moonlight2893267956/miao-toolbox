package com.miao.toolbox.network.service;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.RobotsParserRequest;
import com.miao.toolbox.network.dto.RobotsParserResult;
import com.miao.toolbox.network.dto.RssParserRequest;
import com.miao.toolbox.network.dto.RssParserResult;
import com.miao.toolbox.network.dto.SitemapParserRequest;
import com.miao.toolbox.network.dto.SitemapParserResult;
import com.miao.toolbox.network.dto.WebScrapeRequest;
import com.miao.toolbox.network.dto.WebScrapeResult;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import com.miao.toolbox.network.infrastructure.NetworkTimeoutConfig;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.jsoup.select.Elements;
import org.jsoup.select.Selector;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 网页内容抓取与解析服务。
 *
 * <p>4 个工具全部为只读服务端代理抓取（GET），经 {@link HttpFetcher} 的 SSRF 预校验与超时控制：
 * <ul>
 *   <li>Web 抓取器：URL + CSS 选择器提取文本/属性</li>
 *   <li>RSS / Atom 解析器</li>
 *   <li>Sitemap 解析器（支持 Sitemap Index 递归）</li>
 *   <li>robots.txt 解析器（含路径可抓取性判定）</li>
 * </ul>
 */
@Service
public class ContentParserService {

    private static final int MAX_SITEMAP_URLS = 5000;
    private static final int MAX_SCRAPE_MATCHES = 1000;

    private final HttpFetcher httpFetcher;

    @Autowired
    public ContentParserService(HttpFetcher httpFetcher) {
        this.httpFetcher = httpFetcher;
    }

    // ---------- 公共抓取（统一 SSRF + 状态码 + 非空校验） ----------

    private String fetchContent(String url) {
        HttpFetcher.HttpFetchResult r =
            httpFetcher.fetchContent(url, NetworkTimeoutConfig.HTTP_FETCH.toMillis());
        if (r.statusCode() >= 400) {
            throw new BusinessException(
                "NETWORK_FETCH_STATUS", "目标返回错误状态码 " + r.statusCode() + ": " + url);
        }
        if (r.body() == null || r.body().isBlank()) {
            throw new BusinessException("NETWORK_FETCH_EMPTY", "目标返回空响应体: " + url);
        }
        return r.body();
    }

    // ---------- Web 抓取器 ----------

    public WebScrapeResult scrape(WebScrapeRequest req) {
        try {
            String html = fetchContent(req.getUrl());
            Document doc = Jsoup.parse(html, req.getUrl());
            Elements els = doc.select(req.getSelector());
            boolean attrMode = "attr".equalsIgnoreCase(req.getMode());
            List<WebScrapeResult.WebScrapeMatch> matches = new ArrayList<>();
            for (Element e : els) {
                if (matches.size() >= MAX_SCRAPE_MATCHES) {
                    break;
                }
                String text = e.text();
                String attr = attrMode ? e.attr(req.getAttribute() == null ? "href" : req.getAttribute()) : null;
                matches.add(new WebScrapeResult.WebScrapeMatch(text, attr));
            }
            WebScrapeResult result = new WebScrapeResult();
            result.setMatches(matches);
            result.setMode(req.getMode());
            result.setTotal(matches.size());
            return result;
        } catch (Selector.SelectorParseException e) {
            throw new BusinessException("NETWORK_INVALID_SELECTOR", "非法的 CSS 选择器: " + req.getSelector());
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("NETWORK_WEB_SCRAPE_FAILED", "抓取或解析失败: " + e.getMessage());
        }
    }

    // ---------- RSS / Atom 解析器 ----------

    public RssParserResult parseRss(RssParserRequest req) {
        try {
            String xml = fetchContent(req.getUrl());
            Document doc = Jsoup.parse(xml, "", Parser.xmlParser());
            RssParserResult result = new RssParserResult();
            Element channel = doc.selectFirst("channel");
            if (channel != null) {
                result.setChannel(new RssParserResult.RssChannel(
                    textOf(channel, "title"),
                    textOf(channel, "link"),
                    textOf(channel, "description")));
                List<RssParserResult.RssItem> items = new ArrayList<>();
                for (Element item : channel.select("item")) {
                    items.add(new RssParserResult.RssItem(
                        textOf(item, "title"),
                        textOf(item, "link"),
                        textOf(item, "pubDate"),
                        pickSummary(item)));
                }
                result.setItems(items);
            } else {
                Element feed = doc.selectFirst("feed");
                if (feed == null) {
                    throw new BusinessException(
                        "NETWORK_RSS_PARSE_FAILED", "无法识别的 Feed 格式（既非 RSS 2.0 也非 Atom）");
                }
                result.setChannel(new RssParserResult.RssChannel(
                    textOf(feed, "title"),
                    attrOf(feed, "link", "href"),
                    textOf(feed, "subtitle")));
                List<RssParserResult.RssItem> items = new ArrayList<>();
                for (Element entry : feed.select("entry")) {
                    items.add(new RssParserResult.RssItem(
                        textOf(entry, "title"),
                        attrOf(entry, "link", "href"),
                        textOf(entry, "updated"),
                        pickSummary(entry)));
                }
                result.setItems(items);
            }
            return result;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("NETWORK_RSS_PARSE_FAILED", "Feed 解析失败: " + e.getMessage());
        }
    }

    // ---------- Sitemap 解析器 ----------

    public SitemapParserResult parseSitemap(SitemapParserRequest req) {
        try {
            String xml = fetchContent(req.getUrl());
            Document doc = Jsoup.parse(xml, "", Parser.xmlParser());
            SitemapParserResult result = new SitemapParserResult();
            Element root = doc.children().first();
            boolean isIndex = root != null && "sitemapindex".equalsIgnoreCase(root.tagName());
            if (isIndex) {
                result.setIndex(true);
                List<SitemapParserResult.SitemapUrl> all = new ArrayList<>();
                for (Element sm : root.select("> sitemap")) {
                    String loc = textOf(sm, "loc");
                    if (loc != null && !loc.isBlank()) {
                        try {
                            String sub = fetchContent(loc.trim());
                            all.addAll(parseUrlset(Jsoup.parse(sub, "", Parser.xmlParser())));
                        } catch (Exception ignored) {
                            // 单个子 sitemap 失败不影响整体聚合
                        }
                    }
                }
                result.setUrls(truncate(all, MAX_SITEMAP_URLS));
                result.setTotal(all.size());
            } else {
                List<SitemapParserResult.SitemapUrl> urls = parseUrlset(doc);
                result.setIndex(false);
                result.setUrls(truncate(urls, MAX_SITEMAP_URLS));
                result.setTotal(urls.size());
            }
            return result;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("NETWORK_SITEMAP_PARSE_FAILED", "Sitemap 解析失败: " + e.getMessage());
        }
    }

    private List<SitemapParserResult.SitemapUrl> parseUrlset(Document doc) {
        List<SitemapParserResult.SitemapUrl> urls = new ArrayList<>();
        Element urlset = doc.selectFirst("urlset");
        Elements urlEls = (urlset != null ? urlset : doc).select("url");
        for (Element u : urlEls) {
            urls.add(new SitemapParserResult.SitemapUrl(
                textOf(u, "loc"),
                textOf(u, "lastmod"),
                textOf(u, "priority"),
                textOf(u, "changefreq")));
        }
        return urls;
    }

    // ---------- robots.txt 解析器 ----------

    public RobotsParserResult parseRobots(RobotsParserRequest req) {
        try {
            String base = normalizeDomain(req.getDomain());
            String text = fetchContent(base + "/robots.txt");
            RobotsParserResult result = new RobotsParserResult();
            List<RobotsParserResult.RobotsGroup> groups = new ArrayList<>();
            List<String> sitemaps = new ArrayList<>();
            List<String> allow = new ArrayList<>();
            List<String> disallow = new ArrayList<>();
            String currentAgent = "*";
            for (String raw : text.split("\n")) {
                String line = raw.split("#", 2)[0].trim();
                if (line.isEmpty()) {
                    continue;
                }
                int idx = line.indexOf(':');
                if (idx < 0) {
                    continue;
                }
                String key = line.substring(0, idx).trim().toLowerCase();
                String val = line.substring(idx + 1).trim();
                switch (key) {
                    case "user-agent" -> {
                        if (!allow.isEmpty() || !disallow.isEmpty()) {
                            groups.add(new RobotsParserResult.RobotsGroup(
                                currentAgent, new ArrayList<>(allow), new ArrayList<>(disallow)));
                            allow.clear();
                            disallow.clear();
                        }
                        currentAgent = val;
                    }
                    case "allow" -> {
                        if (!val.isEmpty()) {
                            allow.add(val);
                        }
                    }
                    case "disallow" -> {
                        if (!val.isEmpty()) {
                            disallow.add(val);
                        }
                    }
                    case "sitemap" -> {
                        if (!val.isEmpty()) {
                            sitemaps.add(val);
                        }
                    }
                    default -> {
                        // 忽略未知指令
                    }
                }
            }
            groups.add(new RobotsParserResult.RobotsGroup(
                currentAgent, new ArrayList<>(allow), new ArrayList<>(disallow)));
            result.setGroups(groups);
            result.setSitemaps(sitemaps);

            if (req.getPath() != null && !req.getPath().isBlank()) {
                RobotsCheck check = checkAllowed(groups, req.getPath());
                result.setPathAllowed(check.allowed());
                result.setMatchedRule(check.rule());
            }
            return result;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("NETWORK_ROBOTS_PARSE_FAILED", "robots.txt 解析失败: " + e.getMessage());
        }
    }

    /** 按 Google 规范判定路径是否允许抓取：最长前缀匹配优先，同长度时 Allow 优先。 */
    private RobotsCheck checkAllowed(List<RobotsParserResult.RobotsGroup> groups, String path) {
        List<String> allow = new ArrayList<>();
        List<String> disallow = new ArrayList<>();
        for (RobotsParserResult.RobotsGroup g : groups) {
            if ("*".equals(g.userAgent()) || g.userAgent().isBlank()) {
                allow.addAll(g.allow());
                disallow.addAll(g.disallow());
            }
        }
        String p = path.startsWith("/") ? path : "/" + path;
        int bestLen = -1;
        boolean allowed = true;
        String matched = null;
        for (String rule : disallow) {
            if (rule.isBlank() || !matchesRule(rule, p)) {
                continue;
            }
            int len = rule.length();
            if (len > bestLen) {
                bestLen = len;
                allowed = false;
                matched = "Disallow: " + rule;
            }
        }
        for (String rule : allow) {
            if (rule.isBlank() || !matchesRule(rule, p)) {
                continue;
            }
            int len = rule.length();
            if (len > bestLen) {
                bestLen = len;
                allowed = true;
                matched = "Allow: " + rule;
            } else if (len == bestLen && !allowed) {
                allowed = true;
                matched = "Allow: " + rule;
            }
        }
        return new RobotsCheck(allowed, matched);
    }

    private boolean matchesRule(String rule, String path) {
        String r = rule.startsWith("/") ? rule : "/" + rule;
        if (r.contains("*")) {
            String prefix = r.split("\\*", -1)[0];
            return path.startsWith(prefix);
        }
        return path.startsWith(r);
    }

    // ---------- 工具方法 ----------

    private String normalizeDomain(String domain) {
        String d = domain.trim();
        if (!d.startsWith("http://") && !d.startsWith("https://")) {
            d = "https://" + d;
        }
        if (d.endsWith("/")) {
            d = d.substring(0, d.length() - 1);
        }
        return d;
    }

    private <T> List<T> truncate(List<T> list, int max) {
        return list.size() > max ? new ArrayList<>(list.subList(0, max)) : list;
    }

    private String textOf(Element e, String selector) {
        Element child = e.selectFirst(selector);
        return child == null ? null : child.text();
    }

    private String attrOf(Element e, String selector, String attr) {
        Element child = e.selectFirst(selector);
        if (child == null) {
            return null;
        }
        String v = child.attr(attr);
        return v == null || v.isEmpty() ? child.text() : v;
    }

    private String pickSummary(Element e) {
        String desc = textOf(e, "description");
        if (desc != null && !desc.isBlank()) {
            return desc;
        }
        Element encoded = e.selectFirst("content|encoded");
        return encoded == null ? null : encoded.text();
    }

    private record RobotsCheck(boolean allowed, String rule) {
    }
}
