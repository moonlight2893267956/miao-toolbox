package com.miao.toolbox.observability.dto;

import lombok.Data;

import java.util.List;

/**
 * AI 用量仪表盘统计响应 DTO。
 */
@Data
public class DashboardAiStatsResponse {

    // ===== 卡片 1：总览 =====
    /** 近 7 天总调用量 */
    private long totalCalls;
    /** 近 7 天总 Token 用量 */
    private long totalTokens;
    /** 近 7 天失败率（0.0 ~ 1.0） */
    private double failureRate;
    /** 近 30 分钟活跃用户数 */
    private long onlineUsers;

    // ===== 卡片 2：Agent 分布 =====
    private List<AgentDistributionItem> agentDistribution;

    // ===== 卡片 3：模型分布 =====
    private List<ModelDistributionItem> modelDistribution;

    // ===== 卡片 4：Token 趋势 =====
    private List<TokenTrendItem> tokenTrend7d;

    // ===== 错误码 Top 5 =====
    private List<ErrorCodeItem> errorCodesTop5;

    @Data
    public static class AgentDistributionItem {
        private String agentName;
        private long count;
    }

    @Data
    public static class ModelDistributionItem {
        private String model;
        private long count;
    }

    @Data
    public static class TokenTrendItem {
        private String date;
        private long tokens;
    }

    @Data
    public static class ErrorCodeItem {
        private String errorCode;
        private long count;
    }
}
