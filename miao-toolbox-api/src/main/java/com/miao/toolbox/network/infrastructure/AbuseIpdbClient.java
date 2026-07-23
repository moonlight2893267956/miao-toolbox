package com.miao.toolbox.network.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.network.dto.IpReputationReport;
import com.miao.toolbox.network.dto.IpReputationResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * AbuseIPDB 客户端：代理调用 check 接口查询 IP 滥用评分。
 * API Key 通过环境变量 {@code ABUSEIPDB_API_KEY} 注入（不写入仓库）。
 */
@Slf4j
@Component
public class AbuseIpdbClient {

    private final String apiKey;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final OkHttpClient client;

    public AbuseIpdbClient(
        @Value("${ABUSEIPDB_API_KEY:}") String apiKey
    ) {
        this.apiKey = apiKey == null ? "" : apiKey;
        long ms = NetworkTimeoutConfig.HTTP_FETCH.toMillis();
        this.client = new OkHttpClient.Builder()
            .connectTimeout(ms, TimeUnit.MILLISECONDS)
            .readTimeout(ms, TimeUnit.MILLISECONDS)
            .followRedirects(true)
            .build();
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    public IpReputationResponse check(String ip, int maxAgeInDays) {
        if (!isConfigured()) {
            throw new AbuseIpdbException(0, "AbuseIPDB API Key 未配置");
        }
        // AbuseIPDB APIv1 自 2020-02-01 起弃用；check 端点必须使用 v2。
        // verbose 标志位让响应包含 reports 数组（否则只返回汇总统计，reports 为空）。
        String url = "https://api.abuseipdb.com/api/v2/check"
            + "?ipAddress=" + URLEncoder.encode(ip, StandardCharsets.UTF_8)
            + "&maxAgeInDays=" + maxAgeInDays
            + "&verbose";
        Request request = new Request.Builder()
            .url(url)
            .header("Key", apiKey)
            .header("Accept", "application/json")
            .build();

        try (Response response = client.newCall(request).execute()) {
            String body = readBody(response);
            if (!response.isSuccessful()) {
                throw new AbuseIpdbException(response.code(), parseErrors(body));
            }
            return parseBody(body, ip);
        } catch (AbuseIpdbException e) {
            throw e;
        } catch (Exception e) {
            throw new AbuseIpdbException(0, "AbuseIPDB 请求失败：" + e.getMessage());
        }
    }

    private String readBody(Response response) {
        try (ResponseBody body = response.body()) {
            return body != null ? body.string() : "";
        } catch (Exception e) {
            return "";
        }
    }

    private IpReputationResponse parseBody(String body, String ip) {
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.path("data");
            List<IpReputationReport> reports = new ArrayList<>();
            JsonNode reportsNode = data.path("reports");
            if (reportsNode.isArray()) {
                for (JsonNode r : reportsNode) {
                    List<Integer> cats = new ArrayList<>();
                    for (JsonNode c : r.path("categories")) {
                        cats.add(c.asInt());
                    }
                    reports.add(new IpReputationReport(
                        r.path("reportedAt").asText(null),
                        r.path("comment").asText(null),
                        cats
                    ));
                }
            }
            return IpReputationResponse.builder()
                .ip(data.path("ipAddress").asText(ip))
                .abuseConfidenceScore(data.path("abuseConfidenceScore").asInt())
                .totalReports(data.path("totalReports").asInt())
                .lastReportedAt(data.path("lastReportedAt").asText(null))
                .isPublic(data.path("isPublic").asBoolean())
                .isWhitelisted(data.path("isWhitelisted").asBoolean())
                .domain(data.path("domain").asText(null))
                .usageType(data.path("usageType").asText(null))
                .countryCode(data.path("countryCode").asText(null))
                .isp(data.path("isp").asText(null))
                .reports(reports)
                .build();
        } catch (Exception e) {
            throw new AbuseIpdbException(0, "AbuseIPDB 响应解析失败：" + e.getMessage());
        }
    }

    private String parseErrors(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode errors = root.path("errors");
            if (errors.isArray() && errors.size() > 0) {
                return errors.get(0).path("detail").asText("未知错误");
            }
        } catch (Exception ignored) {
            // 解析失败则返回原文
        }
        return body.length() > 200 ? body.substring(0, 200) : body;
    }
}
