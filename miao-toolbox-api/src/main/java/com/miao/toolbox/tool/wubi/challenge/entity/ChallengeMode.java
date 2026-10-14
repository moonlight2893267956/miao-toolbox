package com.miao.toolbox.tool.wubi.challenge.entity;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;

/**
 * 五笔挑战模式。
 *
 * <p>三种模式各自一条榜单，因此枚举值是**榜单的唯一分区键**，
 * 客户端上报与榜单查询都必须使用这里的字面量。
 *
 * <h3>两套写法，各管一段（不要混用）</h3>
 * <ul>
 *   <li><b>数据库</b>存枚举名 {@code SPRINT / SURVIVAL / DAILY}
 *       （{@code @Enumerated(EnumType.STRING)}）—— 因此 native query 里
 *       传参要用 {@link #name()}。</li>
 *   <li><b>JSON</b> 用 {@link #getCode() 小写 code} {@code sprint / survival / daily}
 *       —— 与前端 TS 的 {@code ChallengeMode} 联合类型逐字一致，
 *       前端不需要做大小写转换。</li>
 * </ul>
 *
 * <p>存字符串而非序号：序号一旦插值或调整枚举顺序，历史数据就会错位。
 */
@Getter
public enum ChallengeMode {

    /** 限时冲刺：60 秒内尽量多答对，得分 = 正确汉字数 */
    SPRINT("sprint", "限时冲刺"),

    /** 生存挑战：3 条命，答错扣命，得分 = 坚持下来的正确题数 */
    SURVIVAL("survival", "生存挑战"),

    /** 每日挑战：每天一套固定题组，得分 = 正确题数（满分 30） */
    DAILY("daily", "每日挑战");

    /** JSON 小写编码（与前端 TS 联合类型一致） */
    private final String code;

    /** 中文标签（仅后端日志用；前端有自己的文案，不依赖此值） */
    private final String label;

    ChallengeMode(String code, String label) {
        this.code = code;
        this.label = label;
    }

    /** 序列化为小写 code。 */
    @JsonValue
    public String getCode() {
        return code;
    }

    /**
     * 反序列化：接受 {@code sprint} / {@code SPRINT} 等任意大小写（去空格）。
     *
     * <p>未知取值抛 {@link IllegalArgumentException}，由 Spring 转成 400 ——
     * 静默回退到某个默认模式会让「上报到错误榜单」这种问题极难排查。
     */
    @JsonCreator
    public static ChallengeMode fromCode(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        for (ChallengeMode mode : values()) {
            if (mode.code.equalsIgnoreCase(trimmed)) {
                return mode;
            }
        }
        throw new IllegalArgumentException("未知挑战模式: " + raw);
    }
}
