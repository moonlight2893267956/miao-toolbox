package com.miao.toolbox.tool.wubi.challenge.dto;

import java.util.List;

/**
 * 「我的挑战」聚合：各模式最佳 + 每日挑战今日状态。
 *
 * <p>挑战入口卡需要在不进榜的情况下显示「个人最佳 / 名次 / 今日是否已打」，
 * 所以单独给一个轻量端点，避免为了拿这点信息去拉整张榜单。
 *
 * @param bests 三种模式的个人最佳（顺序固定：冲刺 / 生存 / 每日）
 * @param daily 每日挑战今日状态
 */
public record MyChallengeResponse(
        List<MyBest> bests,
        DailyStatus daily
) {

    /**
     * 单模式个人最佳。
     *
     * @param mode            模式小写 code（sprint / survival / daily）
     * @param score           最佳得分；无记录为 null
     * @param accuracyPercent 对应记录的准确率
     * @param durationSec     对应记录用时
     * @param maxCombo        对应记录最高连击
     * @param achievedAt      达成时间（ISO-8601 字符串）；无记录为 null
     * @param rank            该模式名次；未上榜为 0
     */
    public record MyBest(
            String mode,
            Integer score,
            int accuracyPercent,
            int durationSec,
            int maxCombo,
            String achievedAt,
            int rank
    ) {
    }

    /**
     * 每日挑战今日状态。
     *
     * @param date      服务器侧认定的今天（{@code YYYY-MM-DD}）
     * @param completed 今天是否已有成绩
     * @param score     今天的成绩；未打为 null
     */
    public record DailyStatus(
            String date,
            boolean completed,
            Integer score
    ) {
    }
}
