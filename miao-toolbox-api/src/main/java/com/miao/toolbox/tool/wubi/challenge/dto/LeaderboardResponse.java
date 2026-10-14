package com.miao.toolbox.tool.wubi.challenge.dto;

import com.miao.toolbox.tool.wubi.challenge.entity.ChallengeMode;

import java.util.List;

/**
 * 榜单查询结果。
 *
 * <p>{@code myRank / myScore} 与 entries 一起返回，是为了让「我的名次在 Top N 之外」
 * 这种情况**一次请求**就能渲染完整（否则前端要再打一次 {@code /me}，
 * 两个请求之间榜单可能已经变了，会出现「表格里没有我、底部也没有我」的空窗）。
 *
 * @param mode   榜单模式
 * @param scope  {@code all}（总榜）或 {@code daily}（日榜）
 * @param date   日榜归属日期 {@code YYYY-MM-DD}；总榜为 null
 * @param total  参榜人数（去重后的用户数）
 * @param entries 榜单行（按名次升序）
 * @param myRank 我的名次；未上榜为 0
 * @param myScore 我的最好成绩；未上榜为 null
 */
public record LeaderboardResponse(
        ChallengeMode mode,
        String scope,
        String date,
        int total,
        List<LeaderboardEntryResponse> entries,
        int myRank,
        Integer myScore
) {
}
