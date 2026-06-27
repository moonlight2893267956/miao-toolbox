package com.miao.toolbox.observability;

import com.miao.toolbox.observability.dto.DashboardAiStatsResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 仪表盘 AI 用量聚合 Service。
 *
 * 4 张卡片 + 错误码 Top 5：
 * 1. 总览（调用量、Token、失败率、活跃用户）
 * 2. Agent 调用量分布（Top 5）
 * 3. 模型分布
 * 4. Token 用量趋势（近 7 天）
 * 5. 错误码 Top 5
 */
@Service
@RequiredArgsConstructor
public class DashboardAiStatsService {

    private final AiInvocationRepository repository;

    /**
     * 获取 AI 用量仪表盘统计数据（近 7 天）。
     */
    public DashboardAiStatsResponse getStats() {
        LocalDateTime since7d = LocalDate.now().minusDays(6).atStartOfDay();

        DashboardAiStatsResponse response = new DashboardAiStatsResponse();

        // 卡片 1：总览
        Object[] overview = repository.getDashboardOverview(since7d);
        if (overview != null && overview.length > 0) {
            Object[] row = (Object[]) overview[0];
            response.setTotalCalls(toLong(row[0]));
            response.setTotalTokens(toLong(row[1]));
            long failureCount = toLong(row[2]);
            long totalCalls = response.getTotalCalls();
            response.setFailureRate(totalCalls > 0 ? (double) failureCount / totalCalls : 0.0);
            response.setOnlineUsers(toLong(row[3]));
        }

        // 卡片 2：Agent 分布
        List<Object[]> agentRows = repository.getAgentDistribution(since7d);
        List<DashboardAiStatsResponse.AgentDistributionItem> agentItems = new ArrayList<>();
        for (Object[] row : agentRows) {
            DashboardAiStatsResponse.AgentDistributionItem item = new DashboardAiStatsResponse.AgentDistributionItem();
            item.setAgentName((String) row[0]);
            item.setCount(toLong(row[1]));
            agentItems.add(item);
        }
        response.setAgentDistribution(agentItems);

        // 卡片 3：模型分布
        List<Object[]> modelRows = repository.getModelDistribution(since7d);
        List<DashboardAiStatsResponse.ModelDistributionItem> modelItems = new ArrayList<>();
        for (Object[] row : modelRows) {
            DashboardAiStatsResponse.ModelDistributionItem item = new DashboardAiStatsResponse.ModelDistributionItem();
            item.setModel((String) row[0]);
            item.setCount(toLong(row[1]));
            modelItems.add(item);
        }
        response.setModelDistribution(modelItems);

        // 卡片 4：Token 趋势
        List<Object[]> trendRows = repository.getTokenTrend(since7d);
        var existingMap = new java.util.LinkedHashMap<String, Long>();
        for (Object[] row : trendRows) {
            String dateStr = row[0] instanceof java.sql.Date d ? d.toLocalDate().toString() : String.valueOf(row[0]);
            existingMap.put(dateStr, toLong(row[1]));
        }
        List<DashboardAiStatsResponse.TokenTrendItem> trendItems = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            LocalDate day = since7d.plusDays(i).toLocalDate();
            String dateStr = day.toString();
            DashboardAiStatsResponse.TokenTrendItem item = new DashboardAiStatsResponse.TokenTrendItem();
            item.setDate(dateStr);
            item.setTokens(existingMap.getOrDefault(dateStr, 0L));
            trendItems.add(item);
        }
        response.setTokenTrend7d(trendItems);

        // 错误码 Top 5
        List<Object[]> errorRows = repository.getErrorCodesTop5(since7d);
        List<DashboardAiStatsResponse.ErrorCodeItem> errorItems = new ArrayList<>();
        for (Object[] row : errorRows) {
            DashboardAiStatsResponse.ErrorCodeItem item = new DashboardAiStatsResponse.ErrorCodeItem();
            item.setErrorCode((String) row[0]);
            item.setCount(toLong(row[1]));
            errorItems.add(item);
        }
        response.setErrorCodesTop5(errorItems);

        return response;
    }

    private long toLong(Object obj) {
        if (obj == null) return 0;
        if (obj instanceof Number n) return n.longValue();
        return 0;
    }
}
