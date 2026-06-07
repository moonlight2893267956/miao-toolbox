package com.miao.toolbox.admin.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class DashboardStatsResponse {

    /** 今日总调用量 */
    private long todayTotalCalls;

    /** 今日异常请求数 */
    private long todayErrorCalls;

    /** 在线用户数（最近30分钟有调用） */
    private long onlineUsers;

    /** 总用户数 */
    private long totalUsers;

    /** 各工具调用量分布 */
    private List<ToolCallCount> toolCallDistribution;

    /** 近7天异常请求趋势 */
    private List<DailyErrorCount> errorTrend7d;

    /** 速率限制触发次数（今日） */
    private long rateLimitHits;

    @Data
    public static class ToolCallCount {
        private String toolId;
        private long count;
    }

    @Data
    public static class DailyErrorCount {
        private String date;
        private long count;
    }
}
