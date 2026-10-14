package com.miao.toolbox.tool.wubi.challenge.repository;

import com.miao.toolbox.tool.wubi.challenge.entity.ChallengeMode;
import com.miao.toolbox.tool.wubi.challenge.entity.WubiChallengeScore;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * 挑战成绩仓储。
 *
 * <p>榜单口径统一为「**每人最佳一条记录**」，排序：
 * {@code score DESC, accuracy_percent DESC, duration_sec ASC, created_at ASC}
 * （同分看准确率，再看用时，最后看提交先后 —— 保证排名稳定、不抖动）。
 *
 * <p>「每人最佳」用 MySQL 8 的 {@code ROW_NUMBER()} 窗口函数一次查出，
 * 而不是「先查用户列表再逐个查最佳」（那会退化成 N+1，且同分时取到哪条不确定）。
 */
@Repository
public interface WubiChallengeScoreRepository extends JpaRepository<WubiChallengeScore, Long> {

    // ─── 我的最佳 ────────────────────────────────────────────

    /** 我的历史最佳（总榜口径）。 */
    Optional<WubiChallengeScore> findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
            Long userId, ChallengeMode mode);

    /** 我在某天的当天最佳（日榜口径）。 */
    Optional<WubiChallengeScore> findFirstByUserIdAndModeAndStatDateOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
            Long userId, ChallengeMode mode, LocalDate statDate);

    // ─── 榜单 ────────────────────────────────────────────────

    /**
     * 总榜：每人历史最佳，按分数倒序取前 N。
     *
     * <p>刻意不用 `:statDate IS NULL OR ...` 这种「一个方法兼容两种口径」的写法：
     * native query 里的 NULL 绑定参数在不同驱动下类型推断不一致，
     * 拆成两个方法虽然多几行，但行为确定。
     */
    @Query(value = """
            SELECT t.user_id          AS userId,
                   t.score            AS score,
                   t.accuracy_percent AS accuracyPercent,
                   t.duration_sec     AS durationSec,
                   t.max_combo        AS maxCombo,
                   t.created_at       AS createdAt
            FROM (
                SELECT s.*,
                       ROW_NUMBER() OVER (
                           PARTITION BY s.user_id
                           ORDER BY s.score DESC, s.accuracy_percent DESC, s.duration_sec ASC, s.created_at ASC
                       ) AS rn
                FROM wubi_challenge_scores s
                WHERE s.mode = :mode
            ) t
            WHERE t.rn = 1
            ORDER BY t.score DESC, t.accuracy_percent DESC, t.duration_sec ASC, t.created_at ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<BestScoreRow> findTopBestScores(@Param("mode") String mode, @Param("limit") int limit);

    /** 日榜：某天每人最佳，按分数倒序取前 N。 */
    @Query(value = """
            SELECT t.user_id          AS userId,
                   t.score            AS score,
                   t.accuracy_percent AS accuracyPercent,
                   t.duration_sec     AS durationSec,
                   t.max_combo        AS maxCombo,
                   t.created_at       AS createdAt
            FROM (
                SELECT s.*,
                       ROW_NUMBER() OVER (
                           PARTITION BY s.user_id
                           ORDER BY s.score DESC, s.accuracy_percent DESC, s.duration_sec ASC, s.created_at ASC
                       ) AS rn
                FROM wubi_challenge_scores s
                WHERE s.mode = :mode AND s.stat_date = :statDate
            ) t
            WHERE t.rn = 1
            ORDER BY t.score DESC, t.accuracy_percent DESC, t.duration_sec ASC, t.created_at ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<BestScoreRow> findTopBestScoresOnDate(@Param("mode") String mode,
                                               @Param("statDate") LocalDate statDate,
                                               @Param("limit") int limit);

    // ─── 参榜人数 ────────────────────────────────────────────

    /** 总榜参榜人数（去重用户数）。 */
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM wubi_challenge_scores WHERE mode = :mode",
            nativeQuery = true)
    long countDistinctUsers(@Param("mode") String mode);

    /** 日榜参榜人数（去重用户数）。 */
    @Query(value = """
            SELECT COUNT(DISTINCT user_id)
            FROM wubi_challenge_scores
            WHERE mode = :mode AND stat_date = :statDate
            """, nativeQuery = true)
    long countDistinctUsersOnDate(@Param("mode") String mode, @Param("statDate") LocalDate statDate);

    // ─── 名次（我的最佳在全站排第几） ──────────────────────────

    /** 总榜：最佳分严格高于我的人数（名次 = 该值 + 1）。 */
    @Query(value = """
            SELECT COUNT(*)
            FROM (
                SELECT user_id, MAX(score) AS best
                FROM wubi_challenge_scores
                WHERE mode = :mode
                GROUP BY user_id
            ) t
            WHERE t.best > :score
            """, nativeQuery = true)
    long countUsersWithBetterBest(@Param("mode") String mode, @Param("score") int score);

    /** 日榜：当天最佳分严格高于我的人数。 */
    @Query(value = """
            SELECT COUNT(*)
            FROM (
                SELECT user_id, MAX(score) AS best
                FROM wubi_challenge_scores
                WHERE mode = :mode AND stat_date = :statDate
                GROUP BY user_id
            ) t
            WHERE t.best > :score
            """, nativeQuery = true)
    long countUsersWithBetterBestOnDate(@Param("mode") String mode,
                                        @Param("statDate") LocalDate statDate,
                                        @Param("score") int score);

    // ─── 写入期裁剪 ───────────────────────────────────────────

    /**
     * 只保留该用户该模式最近 {@code keep} 条记录，其余删除。
     *
     * <p>自托管规模下榜单只需要「最佳」，历史明细没有价值；
     * 不做裁剪的话表会随每次挑战无限增长。
     *
     * <p>MySQL 不允许在 DELETE 的子查询里直接引用被删除的表，
     * 因此套一层派生表（{@code SELECT id FROM (...) t}）绕过该限制。
     */
    @Modifying
    @Query(value = """
            DELETE FROM wubi_challenge_scores
            WHERE user_id = :userId AND mode = :mode
              AND id NOT IN (
                  SELECT id FROM (
                      SELECT id FROM wubi_challenge_scores
                      WHERE user_id = :userId AND mode = :mode
                      ORDER BY created_at DESC, id DESC
                      LIMIT :keep
                  ) t
              )
            """, nativeQuery = true)
    int trimOldScores(@Param("userId") Long userId,
                      @Param("mode") String mode,
                      @Param("keep") int keep);
}
