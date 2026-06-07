package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.DashboardStatsResponse;
import com.miao.toolbox.admin.repository.AuditLogStatsRepository;
import com.miao.toolbox.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final AuditLogStatsRepository statsRepository;
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

        // 今日总调用量
        stats.setTodayTotalCalls(statsRepository.countSince(todayStart));

        // 今日异常请求数
        stats.setTodayErrorCalls(statsRepository.countErrorsSince(todayStart));

        // 在线用户数
        stats.setOnlineUsers(statsRepository.countDistinctUsersSince(last30Min));

        // 总用户数
        stats.setTotalUsers(userRepository.count());

        // 各工具调用量分布
        stats.setToolCallDistribution(statsRepository.toolCallDistribution(todayStart));

        // 近7天异常请求趋势
        stats.setErrorTrend7d(fillEmptyDays(statsRepository.dailyErrorCounts(last7Days), last7Days));

        // 速率限制触发次数（今日，从 Redis 读取）
        stats.setRateLimitHits(getRateLimitHits(todayStart));

        return stats;
    }

    /** 补全7天内没有异常的日期（返回0） */
    List<DashboardStatsResponse.DailyErrorCount> fillEmptyDays(
            List<DashboardStatsResponse.DailyErrorCount> existing, LocalDateTime since) {
        var existingMap = new java.util.LinkedHashMap<String, Long>();
        for (var item : existing) {
            existingMap.put(item.getDate(), item.getCount());
        }

        var result = new java.util.ArrayList<DashboardStatsResponse.DailyErrorCount>();
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
