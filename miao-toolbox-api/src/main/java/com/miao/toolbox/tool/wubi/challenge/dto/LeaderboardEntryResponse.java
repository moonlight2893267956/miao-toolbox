package com.miao.toolbox.tool.wubi.challenge.dto;

/**
 * 榜单的一行。
 *
 * <p>用 record 而非 Lombok 类：布尔字段若叫 {@code isMe}，
 * Lombok 生成的 getter 是 {@code isMe()}，Jackson 会把它序列化成 {@code "me"}，
 * 前端按 {@code isMe} 取值就会拿到 undefined。record 直接以**组件名**作为 JSON 字段名，
 * 不存在这个前缀陷阱。
 *
 * @param rank            名次（从 1 开始）
 * @param username        用户名
 * @param score           得分（主指标）
 * @param accuracyPercent 准确率百分数 0~100
 * @param durationSec     用时（秒）
 * @param maxCombo        最高连击
 * @param isMe            是否为当前登录用户（前端用于高亮本人行）
 */
public record LeaderboardEntryResponse(
        int rank,
        String username,
        int score,
        int accuracyPercent,
        int durationSec,
        int maxCombo,
        boolean isMe
) {
}
