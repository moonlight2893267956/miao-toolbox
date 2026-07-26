package com.miao.toolbox.network.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.network.dto.RobotsParserRequest;
import com.miao.toolbox.network.dto.RobotsParserResult;
import com.miao.toolbox.network.dto.RssParserRequest;
import com.miao.toolbox.network.dto.RssParserResult;
import com.miao.toolbox.network.dto.SitemapParserRequest;
import com.miao.toolbox.network.dto.SitemapParserResult;
import com.miao.toolbox.network.dto.WebScrapeRequest;
import com.miao.toolbox.network.dto.WebScrapeResult;
import com.miao.toolbox.network.service.ContentParserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 网页内容抓取与解析控制器（Story 3.11）。
 * 4 个工具均为只读服务端代理抓取（GET），受 SSRF 防护。
 */
@RestController
@RequestMapping("/api/network/parser")
@RequiredArgsConstructor
public class ContentParserController {

    private final ContentParserService contentParserService;

    @PostMapping("/web-scraper")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public ApiResponse<WebScrapeResult> webScraper(@Valid @RequestBody WebScrapeRequest req) {
        return ApiResponse.success(contentParserService.scrape(req));
    }

    @PostMapping("/rss-parser")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public ApiResponse<RssParserResult> rssParser(@Valid @RequestBody RssParserRequest req) {
        return ApiResponse.success(contentParserService.parseRss(req));
    }

    @PostMapping("/sitemap-parser")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public ApiResponse<SitemapParserResult> sitemapParser(@Valid @RequestBody SitemapParserRequest req) {
        return ApiResponse.success(contentParserService.parseSitemap(req));
    }

    @PostMapping("/robots-txt")
    @RequireRoute("TOOL_NETWORK_TOOLBOX")
    public ApiResponse<RobotsParserResult> robotsParser(@Valid @RequestBody RobotsParserRequest req) {
        return ApiResponse.success(contentParserService.parseRobots(req));
    }
}
