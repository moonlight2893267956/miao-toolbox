package com.miao.toolbox.tool.wubi.challenge.dto;

/**
 * 上报后的即时反馈（结算面板用它显示「已上榜 · 第 N 名 / 新纪录」）。
 *
 * @param mode    模式小写 code
 * @param score   本次得分
 * @param rank    本次成绩在对应榜上的名次（每日挑战按当天榜；其余按总榜）
 * @param total   对应榜的参榜人数
 * @param newBest 是否刷新了个人最佳（后端判定，避免多端本地记录的偏差）
 */
public record SubmitScoreResponse(
        String mode,
        int score,
        int rank,
        int total,
        boolean newBest
) {
}
