package com.miao.toolbox.network.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ContentParserServiceTest {

    @Mock
    private HttpFetcher httpFetcher;

    private ContentParserService service;

    @BeforeEach
    void setUp() {
        service = new ContentParserService(httpFetcher);
    }

    private HttpFetcher.HttpFetchResult ok(String body) {
        return new HttpFetcher.HttpFetchResult(200, "OK", "http://x/", new HashMap<>(), 10L, body);
    }

    @Test
    void scrape_extractsText() {
        when(httpFetcher.fetchContent(anyString(), anyLong()))
            .thenReturn(ok("<html><body><h1>Hello</h1><h1>World</h1></body></html>"));
        WebScrapeRequest req = new WebScrapeRequest();
        req.setUrl("http://x/");
        req.setSelector("h1");
        req.setMode("text");
        WebScrapeResult res = service.scrape(req);
        assertEquals(2, res.getTotal());
        assertEquals("Hello", res.getMatches().get(0).text());
        assertEquals("World", res.getMatches().get(1).text());
    }

    @Test
    void scrape_extractsAttr() {
        when(httpFetcher.fetchContent(anyString(), anyLong()))
            .thenReturn(ok("<html><body><a href=\"https://a/\">x</a></body></html>"));
        WebScrapeRequest req = new WebScrapeRequest();
        req.setUrl("http://x/");
        req.setSelector("a[href]");
        req.setMode("attr");
        req.setAttribute("href");
        WebScrapeResult res = service.scrape(req);
        assertEquals(1, res.getTotal());
        assertEquals("https://a/", res.getMatches().get(0).attrValue());
    }

    @Test
    void scrape_invalidSelector_throws() {
        when(httpFetcher.fetchContent(anyString(), anyLong()))
            .thenReturn(ok("<html></html>"));
        WebScrapeRequest req = new WebScrapeRequest();
        req.setUrl("http://x/");
        req.setSelector("::invalid");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.scrape(req));
        assertTrue(ex.getMessage().contains("选择器"));
    }

    @Test
    void scrape_emptyBody_throws() {
        when(httpFetcher.fetchContent(anyString(), anyLong()))
            .thenReturn(new HttpFetcher.HttpFetchResult(200, "OK", "http://x/", new HashMap<>(), 10L, ""));
        WebScrapeRequest req = new WebScrapeRequest();
        req.setUrl("http://x/");
        req.setSelector("h1");
        assertThrows(BusinessException.class, () -> service.scrape(req));
    }

    @Test
    void rss_parsesChannelAndItems() {
        String xml = "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel>"
            + "<title>Ch</title><link>http://c</link><description>d</description>"
            + "<item><title>T1</title><link>http://t1</link><pubDate>2020</pubDate><description>sum</description></item>"
            + "</channel></rss>";
        when(httpFetcher.fetchContent(anyString(), anyLong())).thenReturn(ok(xml));
        RssParserRequest req = new RssParserRequest();
        req.setUrl("http://x/");
        RssParserResult res = service.parseRss(req);
        assertEquals("Ch", res.getChannel().title());
        assertEquals(1, res.getItems().size());
        assertEquals("T1", res.getItems().get(0).title());
    }

    @Test
    void rss_atomUnsupportedFormat_throws() {
        when(httpFetcher.fetchContent(anyString(), anyLong()))
            .thenReturn(ok("<html><body>not a feed</body></html>"));
        RssParserRequest req = new RssParserRequest();
        req.setUrl("http://x/");
        assertThrows(BusinessException.class, () -> service.parseRss(req));
    }

    @Test
    void sitemap_parsesUrls() {
        String xml = "<?xml version=\"1.0\"?><urlset>"
            + "<url><loc>http://a/1</loc><priority>0.8</priority></url>"
            + "<url><loc>http://a/2</loc></url>"
            + "</urlset>";
        when(httpFetcher.fetchContent(anyString(), anyLong())).thenReturn(ok(xml));
        SitemapParserRequest req = new SitemapParserRequest();
        req.setUrl("http://x/");
        SitemapParserResult res = service.parseSitemap(req);
        assertEquals(2, res.getTotal());
        assertEquals(false, res.isIndex());
        assertEquals("http://a/1", res.getUrls().get(0).loc());
    }

    @Test
    void robots_parsesGroupsAndChecksPath() {
        String txt = "User-agent: *\nDisallow: /admin\nAllow: /admin/public\nSitemap: http://x/s.xml\n";
        when(httpFetcher.fetchContent(anyString(), anyLong())).thenReturn(ok(txt));
        RobotsParserRequest req = new RobotsParserRequest();
        req.setDomain("x.com");
        req.setPath("/admin/secret");
        RobotsParserResult res = service.parseRobots(req);
        assertEquals(1, res.getGroups().size());
        assertEquals(List.of("http://x/s.xml"), res.getSitemaps());
        assertEquals(Boolean.FALSE, res.getPathAllowed());
        assertTrue(res.getMatchedRule().contains("Disallow"));
    }

    @Test
    void fetch_propagatesSsrfBlock() {
        when(httpFetcher.fetchContent(anyString(), anyLong()))
            .thenThrow(new BusinessException("NETWORK_SSRF_BLOCKED", "blocked", 403));
        WebScrapeRequest req = new WebScrapeRequest();
        req.setUrl("http://x/");
        req.setSelector("h1");
        assertThrows(BusinessException.class, () -> service.scrape(req));
    }
}
