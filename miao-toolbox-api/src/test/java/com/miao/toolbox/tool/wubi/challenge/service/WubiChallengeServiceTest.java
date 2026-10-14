package com.miao.toolbox.tool.wubi.challenge.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.tool.wubi.challenge.dto.LeaderboardResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.MyChallengeResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.SubmitScoreRequest;
import com.miao.toolbox.tool.wubi.challenge.dto.SubmitScoreResponse;
import com.miao.toolbox.tool.wubi.challenge.entity.ChallengeMode;
import com.miao.toolbox.tool.wubi.challenge.entity.WubiChallengeScore;
import com.miao.toolbox.tool.wubi.challenge.repository.BestScoreRow;
import com.miao.toolbox.tool.wubi.challenge.repository.WubiChallengeScoreRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link WubiChallengeService} 单元测试。
 *
 * <p>覆盖：上报（首次 / 非首次 / 每日按当天榜 / 非法日期）、
 * 榜单（总榜 / 日榜 / 空榜 / 用户已删除 / limit 上限）、我的挑战（无记录 / 有记录）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("WubiChallengeService 单元测试")
class WubiChallengeServiceTest {

    private static final Long UID = 7L;
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 9);

    @Mock private WubiChallengeScoreRepository scoreRepository;
    @Mock private UserRepository userRepository;

    @InjectMocks private WubiChallengeService service;

    // ── 测试夹具 ────────────────────────────────────────────

    private WubiChallengeScore entity(int score, int accuracy) {
        return WubiChallengeScore.builder()
                .id(1L).userId(UID).mode(ChallengeMode.SPRINT)
                .score(score).correctChars(score).accuracyPercent(accuracy)
                .durationSec(60).maxCombo(20).statDate(TODAY)
                .createdAt(LocalDateTime.of(2026, 10, 9, 10, 0))
                .build();
    }

    /**
     * 造一行榜单投影。
     *
     * <p>⚠️ 必须在 {@code when(...)} **之外**先建好再传进去：
     * 在 {@code when(repo.xxx()).thenReturn(List.of(row(...), ...))} 的参数里现场建 mock
     * 会嵌套 stubbing，Mockito 报 {@code UnfinishedStubbing}。
     */
    private BestScoreRow row(long userId, int score, int accuracy) {
        BestScoreRow row = mock(BestScoreRow.class);
        lenient().when(row.getUserId()).thenReturn(userId);
        lenient().when(row.getScore()).thenReturn(score);
        lenient().when(row.getAccuracyPercent()).thenReturn(accuracy);
        lenient().when(row.getDurationSec()).thenReturn(60);
        lenient().when(row.getMaxCombo()).thenReturn(20);
        return row;
    }

    private SubmitScoreRequest request(ChallengeMode mode, int score, String date) {
        return new SubmitScoreRequest(mode, score, score, 98, 60, 25, date);
    }

    // ── 上报 ────────────────────────────────────────────────

    @Test
    @DisplayName("上报：首次成绩即为个人最佳，名次第 1 且标记新纪录")
    void submit_firstScore_isNewBestAndRankOne() {
        when(scoreRepository.findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                UID, ChallengeMode.SPRINT)).thenReturn(Optional.empty());
        when(scoreRepository.save(any(WubiChallengeScore.class))).thenAnswer(inv -> inv.getArgument(0));
        when(scoreRepository.trimOldScores(anyLong(), anyString(), anyInt())).thenReturn(0);
        when(scoreRepository.countUsersWithBetterBest("SPRINT", 120)).thenReturn(0L);
        when(scoreRepository.countDistinctUsers("SPRINT")).thenReturn(1L);

        SubmitScoreResponse res = service.submit(UID, request(ChallengeMode.SPRINT, 120, "2026-10-09"));

        assertThat(res.mode()).isEqualTo("sprint");
        assertThat(res.score()).isEqualTo(120);
        assertThat(res.rank()).isEqualTo(1);
        assertThat(res.total()).isEqualTo(1);
        assertThat(res.newBest()).isTrue();
        // 写入后必须裁剪，否则表会随每次挑战无限增长
        verify(scoreRepository).trimOldScores(UID, "SPRINT", 100);
    }

    @Test
    @DisplayName("上报：成绩不如历史最佳时，名次按历史最佳计算且不标记新纪录")
    void submit_worseThanBest_usesBestForRank() {
        when(scoreRepository.findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                UID, ChallengeMode.SPRINT)).thenReturn(Optional.of(entity(200, 99)));
        when(scoreRepository.save(any(WubiChallengeScore.class))).thenAnswer(inv -> inv.getArgument(0));
        // 历史最佳 200 分，有 3 人比它更强
        when(scoreRepository.countUsersWithBetterBest("SPRINT", 200)).thenReturn(3L);
        when(scoreRepository.countDistinctUsers("SPRINT")).thenReturn(10L);

        SubmitScoreResponse res = service.submit(UID, request(ChallengeMode.SPRINT, 80, "2026-10-09"));

        assertThat(res.rank()).isEqualTo(4);
        assertThat(res.newBest()).isFalse();
        assertThat(res.score()).isEqualTo(80);
    }

    @Test
    @DisplayName("上报：每日挑战按当天榜计算名次，不混入历史成绩")
    void submit_daily_usesDailyScope() {
        when(scoreRepository
                .findFirstByUserIdAndModeAndStatDateOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                        UID, ChallengeMode.DAILY, TODAY)).thenReturn(Optional.empty());
        when(scoreRepository.save(any(WubiChallengeScore.class))).thenAnswer(inv -> inv.getArgument(0));
        when(scoreRepository.countUsersWithBetterBestOnDate("DAILY", TODAY, 25)).thenReturn(2L);
        when(scoreRepository.countDistinctUsersOnDate("DAILY", TODAY)).thenReturn(5L);

        SubmitScoreResponse res = service.submit(UID, request(ChallengeMode.DAILY, 25, "2026-10-09"));

        assertThat(res.rank()).isEqualTo(3);
        assertThat(res.total()).isEqualTo(5);
        // 每日挑战必须走「当天」查询，不能退化成总榜
        verify(scoreRepository).countUsersWithBetterBestOnDate("DAILY", TODAY, 25);
        verify(scoreRepository, never()).countUsersWithBetterBest(anyString(), anyInt());
    }

    @Test
    @DisplayName("上报：格式对但日期非法（2026-13-45）抛业务异常")
    void submit_invalidDate_throws() {
        assertThatThrownBy(() -> service.submit(UID, request(ChallengeMode.SPRINT, 10, "2026-13-45")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("statDate");
    }

    // ── 榜单 ────────────────────────────────────────────────

    @Test
    @DisplayName("榜单：总榜组装名次、用户名与本人标记")
    void leaderboard_all_assemblesEntries() {
        BestScoreRow first = row(7L, 120, 99);
        BestScoreRow second = row(9L, 100, 95);
        when(scoreRepository.findTopBestScores("SPRINT", 50)).thenReturn(List.of(first, second));
        when(userRepository.findAllById(any(Set.class))).thenReturn(List.of(
                User.builder().id(7L).username("阿渺").build(),
                User.builder().id(9L).username("小王").build()));
        when(scoreRepository.countDistinctUsers("SPRINT")).thenReturn(2L);
        when(scoreRepository.findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                UID, ChallengeMode.SPRINT)).thenReturn(Optional.of(entity(120, 99)));
        when(scoreRepository.countUsersWithBetterBest("SPRINT", 120)).thenReturn(0L);

        LeaderboardResponse res = service.leaderboard(ChallengeMode.SPRINT, "all", null, null, UID);

        assertThat(res.scope()).isEqualTo("all");
        assertThat(res.date()).isNull();
        assertThat(res.total()).isEqualTo(2);
        assertThat(res.entries()).hasSize(2);

        assertThat(res.entries().get(0).rank()).isEqualTo(1);
        assertThat(res.entries().get(0).username()).isEqualTo("阿渺");
        assertThat(res.entries().get(0).score()).isEqualTo(120);
        assertThat(res.entries().get(0).isMe()).isTrue();

        assertThat(res.entries().get(1).rank()).isEqualTo(2);
        assertThat(res.entries().get(1).isMe()).isFalse();

        assertThat(res.myRank()).isEqualTo(1);
        assertThat(res.myScore()).isEqualTo(120);
    }

    @Test
    @DisplayName("榜单：日榜按日期过滤，并回显日期")
    void leaderboard_daily_filtersByDate() {
        BestScoreRow only = row(9L, 30, 100);
        when(scoreRepository.findTopBestScoresOnDate("DAILY", TODAY, 50)).thenReturn(List.of(only));
        when(userRepository.findAllById(any(Set.class)))
                .thenReturn(List.of(User.builder().id(9L).username("小王").build()));
        when(scoreRepository.countDistinctUsersOnDate("DAILY", TODAY)).thenReturn(1L);
        when(scoreRepository
                .findFirstByUserIdAndModeAndStatDateOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                        UID, ChallengeMode.DAILY, TODAY)).thenReturn(Optional.empty());

        LeaderboardResponse res = service.leaderboard(ChallengeMode.DAILY, "daily", "2026-10-09", 50, UID);

        assertThat(res.scope()).isEqualTo("daily");
        assertThat(res.date()).isEqualTo("2026-10-09");
        assertThat(res.entries()).hasSize(1);
        // 我没有成绩 → 名次 0、分数 null（前端据此显示「还没上榜」）
        assertThat(res.myRank()).isZero();
        assertThat(res.myScore()).isNull();
        verify(scoreRepository).findTopBestScoresOnDate("DAILY", TODAY, 50);
    }

    @Test
    @DisplayName("榜单：空榜返回空列表，不抛异常")
    void leaderboard_empty_isSafe() {
        when(scoreRepository.findTopBestScores("SURVIVAL", 50)).thenReturn(List.of());
        when(scoreRepository.countDistinctUsers("SURVIVAL")).thenReturn(0L);
        when(scoreRepository.findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                UID, ChallengeMode.SURVIVAL)).thenReturn(Optional.empty());

        LeaderboardResponse res = service.leaderboard(ChallengeMode.SURVIVAL, "all", null, null, UID);

        assertThat(res.entries()).isEmpty();
        assertThat(res.total()).isZero();
        assertThat(res.myRank()).isZero();
        // 空榜时不应该去查用户名（避免无意义查询）
        verify(userRepository, never()).findAllById(any());
    }

    @Test
    @DisplayName("榜单：用户已被删除时用户名回退为「用户{id}」，不整页失败")
    void leaderboard_deletedUser_fallsBackToPlaceholder() {
        BestScoreRow orphan = row(42L, 88, 90);
        when(scoreRepository.findTopBestScores("SPRINT", 50)).thenReturn(List.of(orphan));
        when(userRepository.findAllById(any(Set.class))).thenReturn(List.of());
        when(scoreRepository.countDistinctUsers("SPRINT")).thenReturn(1L);
        when(scoreRepository.findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                UID, ChallengeMode.SPRINT)).thenReturn(Optional.empty());

        LeaderboardResponse res = service.leaderboard(ChallengeMode.SPRINT, "all", null, null, UID);

        assertThat(res.entries()).hasSize(1);
        assertThat(res.entries().get(0).username()).isEqualTo("用户42");
    }

    @Test
    @DisplayName("榜单：limit 超过上限时被夹到 50")
    void leaderboard_limitIsClamped() {
        when(scoreRepository.findTopBestScores(eq("SPRINT"), anyInt())).thenReturn(List.of());
        when(scoreRepository.countDistinctUsers("SPRINT")).thenReturn(0L);
        when(scoreRepository.findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                UID, ChallengeMode.SPRINT)).thenReturn(Optional.empty());

        service.leaderboard(ChallengeMode.SPRINT, "all", null, 9999, UID);

        verify(scoreRepository).findTopBestScores("SPRINT", 50);
    }

    // ── 我的挑战 ────────────────────────────────────────────

    @Test
    @DisplayName("我的挑战：无任何记录时返回三条空最佳，今日未完成")
    void my_noRecords() {
        when(scoreRepository.findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                eq(UID), any(ChallengeMode.class))).thenReturn(Optional.empty());
        when(scoreRepository
                .findFirstByUserIdAndModeAndStatDateOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                        UID, ChallengeMode.DAILY, TODAY)).thenReturn(Optional.empty());

        MyChallengeResponse res = service.my(UID, TODAY);

        assertThat(res.bests()).hasSize(ChallengeMode.values().length);
        assertThat(res.bests()).allSatisfy(best -> {
            assertThat(best.score()).isNull();
            assertThat(best.rank()).isZero();
        });
        assertThat(res.daily().date()).isEqualTo("2026-10-09");
        assertThat(res.daily().completed()).isFalse();
        assertThat(res.daily().score()).isNull();
    }

    @Test
    @DisplayName("我的挑战：有记录时返回最佳分数与名次，今日已完成")
    void my_withRecords() {
        when(scoreRepository.findFirstByUserIdAndModeOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                eq(UID), any(ChallengeMode.class))).thenReturn(Optional.of(entity(150, 97)));
        when(scoreRepository.countUsersWithBetterBest(anyString(), eq(150))).thenReturn(2L);
        when(scoreRepository
                .findFirstByUserIdAndModeAndStatDateOrderByScoreDescAccuracyPercentDescDurationSecAscCreatedAtAsc(
                        UID, ChallengeMode.DAILY, TODAY)).thenReturn(Optional.of(entity(28, 100)));

        MyChallengeResponse res = service.my(UID, TODAY);

        assertThat(res.bests()).hasSize(3);
        assertThat(res.bests().get(0).score()).isEqualTo(150);
        assertThat(res.bests().get(0).rank()).isEqualTo(3);
        assertThat(res.bests().get(0).achievedAt()).startsWith("2026-10-09T10:00");
        assertThat(res.daily().completed()).isTrue();
        assertThat(res.daily().score()).isEqualTo(28);
    }
}
