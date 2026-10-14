package com.miao.toolbox.tool.wubi.challenge.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.tool.wubi.challenge.dto.LeaderboardEntryResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.LeaderboardResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.MyChallengeResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.SubmitScoreRequest;
import com.miao.toolbox.tool.wubi.challenge.dto.SubmitScoreResponse;
import com.miao.toolbox.tool.wubi.challenge.entity.ChallengeMode;
import com.miao.toolbox.tool.wubi.challenge.entity.WubiChallengeScore;
import com.miao.toolbox.tool.wubi.challenge.repository.BestScoreRow;
import com.miao.toolbox.tool.wubi.challenge.repository.WubiChallengeScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 五笔挑战成绩与排行榜服务。
 *
 * <h3>榜单口径</h3>
 * 一律「**每人最佳一条记录**」：{@code score DESC, accuracy DESC, duration ASC, createdAt ASC}。
 * 总榜与日榜只差一个 {@code stat_date} 过滤。
 *
 * <h3>为什么名次用「比我强的人数 + 1」而不是把全表拉出来数</h3>
 * 全量拉取在用户变多后是不可持续的；只查一次 {@code COUNT} 就能得到名次，
 * 且与分页/limit 无关（Top 50 之外也能给出真实名次）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WubiChallengeService {

    /** 每个用户每个模式最多保留的历史记录数（写入期裁剪，防表无限增长） */
    private static final int KEEP_PER_MODE = 100;

    /** 榜单单次返回上限（不做全量分页） */
    private static final int MAX_LIMIT = 50;

    private static final String SCOPE_ALL = "all";
    private static final String SCOPE_DAILY = "daily";

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private final WubiChallengeScoreRepository scoreRepository;
    private final UserRepository userRepository;

    // ═══════════════════════════════════════════════════════
    // 上报
    // ═══════════════════════════════════════════════════════

    /**
     * 上报一次挑战成绩。
     *
     * <p>名次与「是否刷新纪录」的比对范围与模式一致：
     * 每日挑战看**当天**榜，冲刺/生存看**总榜**。
     */
    @Transactional
    public SubmitScoreResponse submit(Long userId, SubmitScoreRequest request) {
        LocalDate statDate = parseStatDate(request.statDate());
        ChallengeMode mode = request.mode();
        boolean dailyScope = mode == ChallengeMode.DAILY;

        // 先取旧最佳：插入后再查会分不清「这条是不是新的最佳」
        Integer previousBest = myBest(userId, mode, dailyScope, statDate)
                .map(WubiChallengeScore::getScore)
                .orElse(null);

        WubiChallengeScore entity = WubiChallengeScore.builder()
                .userId(userId)
                .mode(mode)
                .score(request.score())
                .correctChars(request.correctChars())
                .accuracyPercent(request.accuracyPercent())
                .durationSec(request.durationSec())
                .maxCombo(request.maxCombo())
                .statDate(statDate)
                .build();
        scoreRepository.save(entity);

        int trimmed = scoreRepository.trimOldScores(userId, mode.name(), KEEP_PER_MODE);
        if (trimmed > 0) {
            log.info("挑战成绩裁剪: userId={} mode={} 删除 {} 条旧记录", userId, mode.getCode(), trimmed);
        }

        int bestScore = previousBest == null ? request.score() : Math.max(previousBest, request.score());
        long better = countBetter(mode, dailyScope, statDate, bestScore);
        long total = countParticipants(mode, dailyScope, statDate);
        boolean newBest = previousBest == null || request.score() > previousBest;

        log.info("挑战成绩上报: userId={} mode={} score={} rank={}/{} newBest={}",
                userId, mode.getCode(), request.score(), better + 1, total, newBest);

        return new SubmitScoreResponse(
                mode.getCode(),
                request.score(),
                (int) (better + 1),
                (int) total,
                newBest
        );
    }

    // ═══════════════════════════════════════════════════════
    // 榜单
    // ═══════════════════════════════════════════════════════

    /**
     * 查询榜单。
     *
     * @param scope  {@code all}（总榜）或 {@code daily}（日榜，需 date）
     * @param date   日榜日期；scope=all 时忽略
     * @param limit  返回条数（上限 {@value #MAX_LIMIT}）
     */
    @Transactional(readOnly = true)
    public LeaderboardResponse leaderboard(ChallengeMode mode,
                                           String scope,
                                           String date,
                                           Integer limit,
                                           Long currentUserId) {
        boolean dailyScope = SCOPE_DAILY.equalsIgnoreCase(scope);
        LocalDate statDate = dailyScope
                ? (date == null || date.isBlank() ? LocalDate.now() : parseStatDate(date))
                : null;
        int size = limit == null ? MAX_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));

        List<BestScoreRow> rows = fetchBoard(mode, dailyScope, statDate, size);

        Map<Long, String> usernameById = loadUsernames(
                rows.stream().map(BestScoreRow::getUserId).collect(Collectors.toSet()));

        List<LeaderboardEntryResponse> entries = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            BestScoreRow row = rows.get(i);
            entries.add(new LeaderboardEntryResponse(
                    i + 1,
                    usernameById.getOrDefault(row.getUserId(), fallbackName(row.getUserId())),
                    safe(row.getScore()),
                    safe(row.getAccuracyPercent()),
                    safe(row.getDurationSec()),
                    safe(row.getMaxCombo()),
                    row.getUserId().equals(currentUserId)
            ));
        }

        long total = countParticipants(mode, dailyScope, statDate);

        Integer myScore = null;
        int myRank = 0;
        if (currentUserId != null) {
            Optional<WubiChallengeScore> mine = myBest(currentUserId, mode, dailyScope, statDate);
            if (mine.isPresent()) {
                myScore = mine.get().getScore();
                myRank = (int) (countBetter(mode, dailyScope, statDate, myScore) + 1);
            }
        }

        return new LeaderboardResponse(
                mode,
                dailyScope ? SCOPE_DAILY : SCOPE_ALL,
                statDate == null ? null : statDate.format(ISO_DATE),
                (int) total,
                entries,
                myRank,
                myScore
        );
    }

    // ═══════════════════════════════════════════════════════
    // 我的挑战
    // ═══════════════════════════════════════════════════════

    /** 各模式个人最佳（总榜口径）+ 每日挑战今日状态。 */
    @Transactional(readOnly = true)
    public MyChallengeResponse my(Long userId, LocalDate today) {
        List<MyChallengeResponse.MyBest> bests = new ArrayList<>(ChallengeMode.values().length);
        for (ChallengeMode mode : ChallengeMode.values()) {
            Optional<WubiChallengeScore> best = myBest(userId, mode, false, null);
            if (best.isEmpty()) {
                bests.add(new MyChallengeResponse.MyBest(mode.getCode(), null, 0, 0, 0, null, 0));
                continue;
            }
            WubiChallengeScore score = best.get();
            int rank = (int) (countBetter(mode, false, null, score.getScore()) + 1);
            bests.add(new MyChallengeResponse.MyBest(
                    mode.getCode(),
                    score.getScore(),
                    score.getAccuracyPercent(),
                    score.getDurationSec(),
                    score.getMaxCombo(),
                    score.getCreatedAt() == null ? null : score.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                    rank
            ));
        }

        Optional<WubiChallengeScore> todayBest =
                myBest(userId, ChallengeMode.DAILY, true, today);

        MyChallengeResponse.DailyStatus daily = new MyChallengeResponse.DailyStatus(
                today.format(ISO_DATE),
                todayBest.isPresent(),
                todayBest.map(WubiChallengeScore::getScore).orElse(null)
        );

        return new MyChallengeResponse(bests, daily);
    }

    // ═══════════════════════════════════════════════════════
    // 内部工具
    // ═══════════════════════════════════════════════════════

    private List<BestScoreRow> fetchBoard(ChallengeMode mode, boolean dailyScope, LocalDate statDate, int limit) {
        return dailyScope
                ? scoreRepository.findTopBestScoresOnDate(mode.name(), statDate, limit)
                : scoreRepository.findTopBestScores(mode.name(), limit);
    }

    private long countParticipants(ChallengeMode mode, boolean dailyScope, LocalDate statDate) {
        return dailyScope
                ? scoreRepository.countDistinctUsersOnDate(mode.name(), statDate)
                : scoreRepository.countDistinctUsers(mode.name());
    }

    private long countBetter(ChallengeMode mode, boolean dailyScope, LocalDate statDate, int score) {
        return dailyScope
                ? scoreRepository.countUsersWithBetterBestOnDate(mode.name(), statDate, score)
                : scoreRepository.countUsersWithBetterBest(mode.name(), score);
    }

    private Optional<WubiChallengeScore> myBest(Long userId, ChallengeMode mode, boolean dailyScope, LocalDate statDate) {
        return dailyScope
                ? scoreRepository.findFirstByUserIdAndModeAndStatDateOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                        userId, mode, statDate)
                : scoreRepository.findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                        userId, mode);
    }

    /**
     * 批量取用户名，避免逐行查库（榜单最多 50 行）。
     *
     * <p>用户可能已被删除，此时回退成 {@code 用户{id}}，
     * 保证榜单行数稳定、不会因为一条冗余数据整页渲染失败。
     */
    private Map<Long, String> loadUsernames(Set<Long> userIds) {
        if (userIds.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<Long, String> result = new HashMap<>(userIds.size());
        for (User user : userRepository.findAllById(userIds)) {
            result.put(user.getId(), user.getUsername());
        }
        return result;
    }

    private String fallbackName(Long userId) {
        return "用户" + userId;
    }

    private int safe(Integer value) {
        return value == null ? 0 : value;
    }

    private LocalDate parseStatDate(String raw) {
        try {
            return LocalDate.parse(raw, ISO_DATE);
        } catch (DateTimeParseException e) {
            // 格式正则挡得住 2026/10/09，挡不住 2026-13-45 这类「格式对但日期非法」
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "statDate 不是合法日期: " + raw, 400);
        }
    }
}
