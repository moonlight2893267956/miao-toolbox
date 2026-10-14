package com.miao.toolbox.tool.wubi.challenge.dto;

import com.miao.toolbox.tool.wubi.challenge.entity.ChallengeMode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * 挑战成绩上报请求。
 *
 * <p>本轮明确**不做反作弊**（信任客户端），但上限约束必须做：
 * 脏数据一旦入库，榜单会被一条异常值永久污染，且没有任何服务端依据可以事后矫正。
 * 上限取值按「人类可能达到的极限」留足冗余，不会误伤正常成绩。
 */
public record SubmitScoreRequest(

        @NotNull(message = "mode 不能为空")
        ChallengeMode mode,

        /** 得分：冲刺=正确字数、生存=正确题数、每日=正确题数 */
        @Min(value = 0, message = "score 不能为负")
        @Max(value = 10000, message = "score 超出上限")
        int score,

        /** 正确打出的汉字数 */
        @Min(value = 0, message = "correctChars 不能为负")
        @Max(value = 10000, message = "correctChars 超出上限")
        int correctChars,

        /** 准确率百分数 0~100 */
        @Min(value = 0, message = "accuracyPercent 不能为负")
        @Max(value = 100, message = "accuracyPercent 不能超过 100")
        int accuracyPercent,

        /** 本次用时（秒），上限 2 小时 */
        @Min(value = 0, message = "durationSec 不能为负")
        @Max(value = 7200, message = "durationSec 超出上限")
        int durationSec,

        /** 本次最高连击 */
        @Min(value = 0, message = "maxCombo 不能为负")
        @Max(value = 10000, message = "maxCombo 超出上限")
        int maxCombo,

        /** 归属日期（客户端本地时区），日榜按此归档 */
        @NotNull(message = "statDate 不能为空")
        @Pattern(regexp = "\\d{4}-\\d{2}-\\d{2}", message = "statDate 必须是 YYYY-MM-DD")
        String statDate
) {
}
