package com.miao.toolbox.tool.wubi.challenge.controller;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.LeaderboardResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.MyChallengeResponse;
import com.miao.toolbox.tool.wubi.challenge.dto.SubmitScoreRequest;
import com.miao.toolbox.tool.wubi.challenge.dto.SubmitScoreResponse;
import com.miao.toolbox.tool.wubi.challenge.entity.ChallengeMode;
import com.miao.toolbox.tool.wubi.challenge.service.WubiChallengeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 五笔挑战成绩与排行榜 API。
 *
 * <p>端点全部受 {@code TOOL_WUBI_TUTOR} 路由权限保护（该路由由
 * {@code V36__register_wubi_tutor_route.sql} 注册），与 {@code WubiAiController} 同一范式。
 *
 * <p>用户身份从 {@code @AuthenticationPrincipal} 取（Spring Security 注入的 {@code User} 实体），
 * 不接受客户端传 userId —— 否则任何人都能替别人刷分。
 */
@Slf4j
@RestController
@RequestMapping("/api/wubi/challenge")
@RequireRoute("TOOL_WUBI_TUTOR")
@RequiredArgsConstructor
public class WubiChallengeController {

    private final WubiChallengeService challengeService;

    /** 上报一次挑战成绩。 */
    @PostMapping("/scores")
    public ApiResponse<SubmitScoreResponse> submit(
            @AuthenticationPrincipal Object principal,
            @Valid @RequestBody SubmitScoreRequest request) {
        Long userId = requireUserId(principal);
        return ApiResponse.success(challengeService.submit(userId, request));
    }

    /**
     * 查询榜单。
     *
     * @param mode  挑战模式（sprint / survival / daily，大小写不敏感）
     * @param scope {@code all} 总榜（默认） / {@code daily} 日榜
     * @param date  日榜日期（YYYY-MM-DD），缺省为服务器当天
     * @param limit 返回条数，缺省 50，上限 50
     */
    @GetMapping("/leaderboard")
    public ApiResponse<LeaderboardResponse> leaderboard(
            @AuthenticationPrincipal Object principal,
            @RequestParam("mode") String mode,
            @RequestParam(value = "scope", defaultValue = "all") String scope,
            @RequestParam(value = "date", required = false) String date,
            @RequestParam(value = "limit", required = false) Integer limit) {
        Long userId = extractUserId(principal);
        // 不用 @RequestParam ChallengeMode：Spring 的枚举转换走 ValueError（只认大写枚举名），
        // 与 JSON 侧的小写 code 语义不一致；这里显式转换，并保证非法值返回 400 而不是 500。
        ChallengeMode parsedMode = parseMode(mode);
        return ApiResponse.success(challengeService.leaderboard(parsedMode, scope, date, limit, userId));
    }

    /** 我的各模式最佳 + 每日挑战今日状态。 */
    @GetMapping("/me")
    public ApiResponse<MyChallengeResponse> my(@AuthenticationPrincipal Object principal) {
        Long userId = requireUserId(principal);
        return ApiResponse.success(challengeService.my(userId, LocalDate.now()));
    }

    // ==================== 工具方法 ====================

    /**
     * 允许匿名的场景（榜单可公开看）：取不到身份就返回 null，
     * 由 Service 处理成「没有我的名次」，而不是抛 401。
     */
    private Long extractUserId(Object principal) {
        if (principal instanceof User user) {
            return user.getId();
        }
        return null;
    }

    /**
     * 必须登录的场景（上报 / 我的挑战）。
     *
     * <p>{@code @RequireRoute} 与安全过滤链正常情况下已拦住未认证请求；
     * 这里再兜一次是为了防止「身份解析失败但请求仍到达 Controller」时
     * 以 {@code userId=null} 写库，产生孤儿成绩。
     */
    private Long requireUserId(Object principal) {
        Long userId = extractUserId(principal);
        if (userId == null) {
            throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED, "请先登录", 401);
        }
        return userId;
    }

    /** 解析模式小写 code（大小写不敏感），非法值转成 400。 */
    private ChallengeMode parseMode(String raw) {
        try {
            return ChallengeMode.fromCode(raw);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, e.getMessage(), 400);
        }
    }
}
