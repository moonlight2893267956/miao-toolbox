package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.DashboardStatsResponse;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.observability.AiInvocationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.math.BigInteger;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 仪表盘统计服务（基于 ai_invocations）。
 *
 * 历史背景：早期基于 audit_logs 实现，但 audit_logs 从未写入，统计永远是 0。
 * 改用 ai_invocations（2026-06-27）作为真实数据源。
 */
@Service
@RequiredArgsConstructor
public class DashboardService {

    private final AiInvocationRepository aiInvocationRepository;
    private final UserRepository userRepository;

    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;

    /**
     * 获取仪表盘统计数据
     */
    public DashboardStatsResponse getStats() {
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        LocalDateTime last30Min = LocalDateTime.now().minusMinutes(30);
        LocalDateTime last7Days = LocalDate.now().minusDays(6).atStartOfDay();

        DashboardStatsResponse stats = new DashboardStatsResponse();

        // 今日总调用量 = ai_invocations 今日 count
        stats.setTodayTotalCalls(aiInvocationRepository.countSince(todayStart));

        // 今日异常数 = ai_invocations 今日 FAILURE count
        stats.setTodayErrorCalls(aiInvocationRepository.countFailuresSince(todayStart));

        // 在线用户数（最近 30 分钟有调用）
        stats.setOnlineUsers(aiInvocationRepository.countDistinctUsersSince(last30Min));

        // 总用户数
        stats.setTotalUsers(userRepository.count());

        // 各 Agent 调用量分布
        stats.setToolCallDistribution(toToolCallDistribution(
                aiInvocationRepository.agentCallDistribution(todayStart)));

        // 近 7 天异常趋势
        stats.setErrorTrend7d(fillEmptyDays(
                toDailyErrorCounts(aiInvocationRepository.dailyFailureCounts(last7Days)),
                last7Days));

        // 速率限制触发次数（今日，从 Redis 读取）
        stats.setRateLimitHits(getRateLimitHits(todayStart));

        return stats;
    }

    /** 补全 7 天内没有异常的日期（返回 0） */
    List<DashboardStatsResponse.DailyErrorCount> fillEmptyDays(
            List<DashboardStatsResponse.DailyErrorCount> existing, LocalDateTime since) {
        var existingMap = new java.util.LinkedHashMap<String, Long>();
        for (var item : existing) {
            existingMap.put(item.getDate(), item.getCount());
        }

        var result = new ArrayList<DashboardStatsResponse.DailyErrorCount>();
        for (int i = 0; i < 7; i++) {
            LocalDate day = since.plusDays(i).toLocalDate();
            String dateStr = day.toString();
            DashboardStatsResponse.DailyErrorCount item = new DashboardStatsResponse.DailyErrorCount();
            item.setDate(dateStr);
            item.setCount(existingMap.getOrDefault(dateStr, 0L));
            result.add(item);
        }
        return result;
    }

    /** 转换 Object[] 列表 → DTO */
    private List<DashboardStatsResponse.ToolCallCount> toToolCallDistribution(List<Object[]> rows) {
        List<DashboardStatsResponse.ToolCallCount> result = new ArrayList<>();
        for (Object[] row : rows) {
            DashboardStatsResponse.ToolCallCount item = new DashboardStatsResponse.ToolCallCount();
            item.setToolId(toStr(row[0]));
            item.setCount(toLong(row[1]));
            result.add(item);
        }
        return result;
    }

    private List<DashboardStatsResponse.DailyErrorCount> toDailyErrorCounts(List<Object[]> rows) {
        List<DashboardStatsResponse.DailyErrorCount> result = new ArrayList<>();
        for (Object[] row : rows) {
            DashboardStatsResponse.DailyErrorCount item = new DashboardStatsResponse.DailyErrorCount();
            Object d = row[0];
            item.setDate(d == null ? null : d.toString());
            item.setCount(toLong(row[1]));
            result.add(item);
        }
        return result;
    }

    private static String toStr(Object o) {
        return o == null ? null : o.toString();
    }

    private static long toLong(Object o) {
        if (o == null) return 0L;
        if (o instanceof Number n) return n.longValue();
        if (o instanceof BigInteger bi) return bi.longValue();
        return Long.parseLong(o.toString());
    }

    /** 从 Redis 获取今日速率限制触发次数 */
    private long getRateLimitHits(LocalDateTime since) {
        if (redisTemplate == null) return 0;
        try {
            var keys = redisTemplate.keys("miao:ratelimit:hits:*");
            if (keys == null || keys.isEmpty()) return 0;
            long total = 0;
            for (String key : keys) {
                Object val = redisTemplate.opsForValue().get(key);
                if (val instanceof Number n) total += n.longValue();
            }
            return total;
        } catch (Exception e) {
            return 0;
        }
    }
}
