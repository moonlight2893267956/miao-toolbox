package com.miao.toolbox.observability;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * AI 调用记录 Repository。
 *
 * 核心查询路径：
 * - 仪表盘聚合 → @Query native SQL
 * - 列表分页筛选 → findByFilters (JPQL)
 * - 用户用量 → countByUserId / aggregateByUserId
 * - 保留清理 → deleteByCreatedAtBefore
 */
@Repository
public interface AiInvocationRepository extends JpaRepository<AiInvocation, Long> {

    // ========== 仪表盘聚合查询 ==========

    /**
     * 仪表盘总览：7 天内调用量、token、失败率、活跃用户
     */
    @Query(value = """
        SELECT
            COUNT(*) AS total_calls,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            SUM(CASE WHEN status = 'FAILURE' THEN 1 ELSE 0 END) AS failure_count,
            COUNT(DISTINCT user_id) AS online_users
        FROM ai_invocations
        WHERE created_at >= :since
        """, nativeQuery = true)
    Object[] getDashboardOverview(@Param("since") LocalDateTime since);

    /**
     * Agent 调用量分布（Top 5）
     */
    @Query(value = """
        SELECT agent_name, COUNT(*) AS cnt
        FROM ai_invocations
        WHERE created_at >= :since
        GROUP BY agent_name
        ORDER BY cnt DESC
        LIMIT 5
        """, nativeQuery = true)
    List<Object[]> getAgentDistribution(@Param("since") LocalDateTime since);

    /**
     * 模型分布
     */
    @Query(value = """
        SELECT model, COUNT(*) AS cnt
        FROM ai_invocations
        WHERE created_at >= :since AND model IS NOT NULL
        GROUP BY model
        ORDER BY cnt DESC
        """, nativeQuery = true)
    List<Object[]> getModelDistribution(@Param("since") LocalDateTime since);

    /**
     * Token 用量趋势（近 7 天按天聚合）
     */
    @Query(value = """
        SELECT DATE(created_at) AS d, COALESCE(SUM(total_tokens), 0) AS tokens
        FROM ai_invocations
        WHERE created_at >= :since
        GROUP BY DATE(created_at)
        ORDER BY d
        """, nativeQuery = true)
    List<Object[]> getTokenTrend(@Param("since") LocalDateTime since);

    /**
     * 近 7 天错误码 Top 5
     */
    @Query(value = """
        SELECT error_code, COUNT(*) AS cnt
        FROM ai_invocations
        WHERE created_at >= :since AND status = 'FAILURE' AND error_code IS NOT NULL
        GROUP BY error_code
        ORDER BY cnt DESC
        LIMIT 5
        """, nativeQuery = true)
    List<Object[]> getErrorCodesTop5(@Param("since") LocalDateTime since);

    // ========== 列表分页查询 ==========

    /**
     * 调用日志列表分页查询（支持多条件筛选）
     */
    @Query("""
        SELECT a FROM AiInvocation a
        WHERE (:userId IS NULL OR a.userId = :userId)
          AND (:agentName IS NULL OR a.agentName = :agentName)
          AND (:model IS NULL OR a.model = :model)
          AND (:status IS NULL OR a.status = :status)
          AND (:traceId IS NULL OR a.traceId LIKE %:traceId%)
          AND a.createdAt >= :startTime
          AND (:endTime IS NULL OR a.createdAt < :endTime)
        ORDER BY a.createdAt DESC
        """)
    Page<AiInvocation> findByFilters(
            @Param("userId") Long userId,
            @Param("agentName") String agentName,
            @Param("model") String model,
            @Param("status") String status,
            @Param("traceId") String traceId,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime,
            Pageable pageable);

    /**
     * 查询所有不同的 agent_name（用于下拉筛选选项）
     */
    @Query("SELECT DISTINCT a.agentName FROM AiInvocation a ORDER BY a.agentName")
    List<String> findDistinctAgentNames();

    /**
     * 查询所有不同的 model（用于下拉筛选选项）
     */
    @Query("SELECT DISTINCT a.model FROM AiInvocation a WHERE a.model IS NOT NULL ORDER BY a.model")
    List<String> findDistinctModels();

    // ========== 用户用量统计 ==========

    /**
     * 用户累计统计
     */
    @Query(value = """
        SELECT
            COUNT(*) AS total_calls,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            SUM(CASE WHEN status = 'FAILURE' THEN 1 ELSE 0 END) AS failure_count,
            MAX(created_at) AS last_called_at,
            COUNT(DISTINCT agent_name) AS agent_count,
            COUNT(DISTINCT model) AS model_count
        FROM ai_invocations
        WHERE user_id = :userId
          AND created_at >= :since
        """, nativeQuery = true)
    Object[] getUserUsageSummary(@Param("userId") Long userId, @Param("since") LocalDateTime since);

    // ========== 保留清理 ==========

    /**
     * 删除指定时间之前的调用记录（定时清理任务）
     */
    long deleteByCreatedAtBefore(LocalDateTime before);

    // ========== DashboardService 旧接口兼容（基于 ai_invocations） ==========

    /** 起始时间之后的总调用数 */
    @Query(value = "SELECT COUNT(*) FROM ai_invocations WHERE created_at >= :since", nativeQuery = true)
    long countSince(@Param("since") LocalDateTime since);

    /** 起始时间之后的失败数（status = 'FAILURE'） */
    @Query(value = "SELECT COUNT(*) FROM ai_invocations WHERE created_at >= :since AND status = 'FAILURE'", nativeQuery = true)
    long countFailuresSince(@Param("since") LocalDateTime since);

    /** 起始时间之后的去重用户数 */
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM ai_invocations WHERE created_at >= :since", nativeQuery = true)
    long countDistinctUsersSince(@Param("since") LocalDateTime since);

    /** Agent 调用量分布（按 agent_name 聚合） */
    @Query(value = """
        SELECT agent_name, COUNT(*) AS cnt
        FROM ai_invocations
        WHERE created_at >= :since
        GROUP BY agent_name
        ORDER BY cnt DESC
        """, nativeQuery = true)
    List<Object[]> agentCallDistribution(@Param("since") LocalDateTime since);

    /** 每日失败数（近 N 天） */
    @Query(value = """
        SELECT DATE(created_at) AS d, COUNT(*) AS cnt
        FROM ai_invocations
        WHERE created_at >= :since AND status = 'FAILURE'
        GROUP BY DATE(created_at)
        ORDER BY d
        """, nativeQuery = true)
    List<Object[]> dailyFailureCounts(@Param("since") LocalDateTime since);
}
