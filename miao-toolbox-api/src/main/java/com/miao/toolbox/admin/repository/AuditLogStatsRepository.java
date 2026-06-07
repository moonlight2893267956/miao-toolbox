package com.miao.toolbox.admin.repository;

import com.miao.toolbox.admin.dto.DashboardStatsResponse;
import com.miao.toolbox.admin.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AuditLogStatsRepository extends JpaRepository<AuditLog, Long> {

    /** 今日总调用量 */
    @Query("SELECT COUNT(a) FROM AuditLog a WHERE a.createdAt >= :since")
    long countSince(@Param("since") LocalDateTime since);

    /** 今日异常请求数 */
    @Query("SELECT COUNT(a) FROM AuditLog a WHERE a.createdAt >= :since AND a.responseStatus <> 'SUCCESS'")
    long countErrorsSince(@Param("since") LocalDateTime since);

    /** 在线用户数（最近30分钟有调用） */
    @Query("SELECT COUNT(DISTINCT a.userId) FROM AuditLog a WHERE a.createdAt >= :since")
    long countDistinctUsersSince(@Param("since") LocalDateTime since);

    /** 各工具调用量分布（今日） */
    @Query("SELECT a.toolId AS toolId, COUNT(a) AS count FROM AuditLog a WHERE a.createdAt >= :since GROUP BY a.toolId ORDER BY count DESC")
    List<DashboardStatsResponse.ToolCallCount> toolCallDistribution(@Param("since") LocalDateTime since);

    /** 近7天每日异常请求数 */
    @Query("SELECT CAST(a.createdAt AS date) AS date, COUNT(a) AS count FROM AuditLog a " +
           "WHERE a.createdAt >= :since AND a.responseStatus <> 'SUCCESS' " +
           "GROUP BY CAST(a.createdAt AS date) ORDER BY date")
    List<DashboardStatsResponse.DailyErrorCount> dailyErrorCounts(@Param("since") LocalDateTime since);
}
