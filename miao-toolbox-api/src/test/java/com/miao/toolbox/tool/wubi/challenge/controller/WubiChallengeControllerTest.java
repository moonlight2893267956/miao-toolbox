package com.miao.toolbox.tool.wubi.challenge.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.exception.GlobalExceptionHandler;
import com.miao.toolbox.tool.wubi.challenge.dto.LeaderboardEntryResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.LeaderboardResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.MyChallengeResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.SubmitScoreRequest;
import com.miao.toolbox.tool.wubi.challenge.dto.SubmitScoreResponse;
import com.miao.toolbox.tool.wubi.challenge.entity.ChallengeMode;
import com.miao.toolbox.tool.wubi.challenge.service.WubiChallengeService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@link WubiChallengeController} 测试（standalone MockMvc，与仓库既有控制器测试同范式）。
 *
 * <p>覆盖：路由与响应壳、请求体校验失败、非法 mode 参数、未登录上报 / 查询被拒。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("WubiChallengeController 单元测试")
class WubiChallengeControllerTest {

    private static final User TEST_USER = User.builder()
            .id(1L).username("testuser").isEnabled(true).build();

    @Mock private WubiChallengeService challengeService;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        WubiChallengeController controller = new WubiChallengeController(challengeService);
        mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        authenticateAs(TEST_USER);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(Object principal) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, List.of(() -> "ROLE_USER")));
    }

    private String body(String mode, int score, String statDate) {
        return """
                {"mode":"%s","score":%d,"correctChars":%d,"accuracyPercent":98,
                 "durationSec":60,"maxCombo":25,"statDate":"%s"}
                """.formatted(mode, score, score, statDate);
    }

    // ── 上报 ────────────────────────────────────────────────

    @Test
    @DisplayName("POST /scores：正常上报返回统一响应壳与名次")
    void submit_ok() throws Exception {
        when(challengeService.submit(eq(1L), any(SubmitScoreRequest.class)))
                .thenReturn(new SubmitScoreResponse("sprint", 120, 3, 9, true));

        mvc.perform(post("/api/wubi/challenge/scores")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("sprint", 120, "2026-10-09")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.mode").value("sprint"))
                .andExpect(jsonPath("$.data.score").value(120))
                .andExpect(jsonPath("$.data.rank").value(3))
                .andExpect(jsonPath("$.data.total").value(9))
                .andExpect(jsonPath("$.data.newBest").value(true));
    }

    @Test
    @DisplayName("POST /scores：分数超出上限被校验拦下（400）")
    void submit_scoreTooLarge_isRejected() throws Exception {
        mvc.perform(post("/api/wubi/challenge/scores")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("sprint", 999999, "2026-10-09")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("POST /scores：statDate 格式非法被校验拦下（400）")
    void submit_badDate_isRejected() throws Exception {
        mvc.perform(post("/api/wubi/challenge/scores")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("sprint", 100, "2026/10/09")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("POST /scores：principal 不是 User（未登录）返回 401")
    void submit_unauthenticated_isUnauthorized() throws Exception {
        authenticateAs("anonymous");

        mvc.perform(post("/api/wubi/challenge/scores")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("sprint", 100, "2026-10-09")))
                .andExpect(status().isUnauthorized());
    }

    // ── 榜单 ────────────────────────────────────────────────

    @Test
    @DisplayName("GET /leaderboard：总榜返回条目与我的名次")
    void leaderboard_ok() throws Exception {
        when(challengeService.leaderboard(eq(ChallengeMode.SPRINT), eq("all"), isNull(), isNull(), eq(1L)))
                .thenReturn(new LeaderboardResponse(
                        ChallengeMode.SPRINT, "all", null, 1,
                        List.of(new LeaderboardEntryResponse(1, "阿渺", 120, 99, 60, 25, true)),
                        1, 120));

        mvc.perform(get("/api/wubi/challenge/leaderboard").param("mode", "sprint"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.mode").value("sprint"))
                .andExpect(jsonPath("$.data.scope").value("all"))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.myRank").value(1))
                .andExpect(jsonPath("$.data.myScore").value(120))
                .andExpect(jsonPath("$.data.entries[0].rank").value(1))
                .andExpect(jsonPath("$.data.entries[0].username").value("阿渺"))
                .andExpect(jsonPath("$.data.entries[0].isMe").value(true));
    }

    @Test
    @DisplayName("GET /leaderboard：mode 非法返回 400，而不是 500")
    void leaderboard_invalidMode_isBadRequest() throws Exception {
        mvc.perform(get("/api/wubi/challenge/leaderboard").param("mode", "not-a-mode"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("GET /leaderboard：缺少 mode 参数返回 400")
    void leaderboard_missingMode_isBadRequest() throws Exception {
        mvc.perform(get("/api/wubi/challenge/leaderboard"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET /leaderboard：日榜参数原样透传给 Service")
    void leaderboard_daily_passesScopeAndDate() throws Exception {
        when(challengeService.leaderboard(eq(ChallengeMode.DAILY), eq("daily"), eq("2026-10-09"), eq(10), eq(1L)))
                .thenReturn(new LeaderboardResponse(
                        ChallengeMode.DAILY, "daily", "2026-10-09", 0, List.of(), 0, null));

        mvc.perform(get("/api/wubi/challenge/leaderboard")
                        .param("mode", "daily")
                        .param("scope", "daily")
                        .param("date", "2026-10-09")
                        .param("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.scope").value("daily"))
                .andExpect(jsonPath("$.data.date").value("2026-10-09"))
                .andExpect(jsonPath("$.data.myScore").doesNotExist());
    }

    // ── 我的挑战 ────────────────────────────────────────────

    @Test
    @DisplayName("GET /me：返回各模式最佳与今日状态")
    void me_ok() throws Exception {
        when(challengeService.my(eq(1L), any())).thenReturn(new MyChallengeResponse(
                List.of(new MyChallengeResponse.MyBest("sprint", 120, 99, 60, 25, "2026-10-09T10:00:00", 1)),
                new MyChallengeResponse.DailyStatus("2026-10-09", true, 28)));

        mvc.perform(get("/api/wubi/challenge/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.bests[0].mode").value("sprint"))
                .andExpect(jsonPath("$.data.bests[0].score").value(120))
                .andExpect(jsonPath("$.data.daily.completed").value(true))
                .andExpect(jsonPath("$.data.daily.score").value(28));
    }

    @Test
    @DisplayName("GET /me：principal 不是 User（未登录）返回 401")
    void me_unauthenticated_isUnauthorized() throws Exception {
        authenticateAs("anonymous");

        mvc.perform(get("/api/wubi/challenge/me"))
                .andExpect(status().isUnauthorized());
    }
}
