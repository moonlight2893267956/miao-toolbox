package com.miao.toolbox.tool.wubi.challenge.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link ChallengeMode} 取值契约测试。
 *
 * <p>枚举同时承担「JSON 小写 code」与「数据库大写枚举名」两套写法，
 * 任何一侧写错都会让成绩落到错误的榜单，因此把映射关系锁在测试里。
 */
@DisplayName("ChallengeMode 模式枚举")
class ChallengeModeTest {

    @Test
    @DisplayName("code 为小写，与前端 TS 联合类型一致")
    void codes_areLowercase() {
        assertThat(ChallengeMode.SPRINT.getCode()).isEqualTo("sprint");
        assertThat(ChallengeMode.SURVIVAL.getCode()).isEqualTo("survival");
        assertThat(ChallengeMode.DAILY.getCode()).isEqualTo("daily");
    }

    @Test
    @DisplayName("fromCode 大小写不敏感并去除空格")
    void fromCode_isCaseInsensitiveAndTrims() {
        assertThat(ChallengeMode.fromCode("sprint")).isEqualTo(ChallengeMode.SPRINT);
        assertThat(ChallengeMode.fromCode("SPRINT")).isEqualTo(ChallengeMode.SPRINT);
        assertThat(ChallengeMode.fromCode("  Survival ")).isEqualTo(ChallengeMode.SURVIVAL);
        assertThat(ChallengeMode.fromCode("dAiLy")).isEqualTo(ChallengeMode.DAILY);
    }

    @Test
    @DisplayName("fromCode 接受 null（交由 @NotNull 报错），拒绝未知取值")
    void fromCode_nullOrUnknown() {
        assertThat(ChallengeMode.fromCode(null)).isNull();
        assertThatThrownBy(() -> ChallengeMode.fromCode("weekly"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("weekly");
    }

    @Test
    @DisplayName("数据库侧使用枚举名（native query 传参依赖它）")
    void databaseUsesEnumName() {
        assertThat(ChallengeMode.valueOf("SPRINT")).isEqualTo(ChallengeMode.SPRINT);
        assertThat(ChallengeMode.SURVIVAL.name()).isEqualTo("SURVIVAL");
    }
}
