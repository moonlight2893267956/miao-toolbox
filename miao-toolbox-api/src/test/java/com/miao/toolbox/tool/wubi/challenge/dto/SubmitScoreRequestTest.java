package com.miao.toolbox.tool.wubi.challenge.dto;

import com.miao.toolbox.tool.wubi.challenge.entity.ChallengeMode;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 上报请求的边界约束测试。
 *
 * <p>本轮不做反作弊（信任客户端），所以**上限约束是唯一的服务端防线**：
 * 一条越界成绩入库会永久污染榜单，且没有依据可以事后矫正。
 * 这里逐条锁住上限，避免以后「顺手放宽」把防线拿掉。
 */
@DisplayName("SubmitScoreRequest 校验约束")
class SubmitScoreRequestTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void init() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void close() {
        factory.close();
    }

    private Set<String> violations(SubmitScoreRequest request) {
        return validator.validate(request).stream()
                .map(ConstraintViolation::getPropertyPath)
                .map(Object::toString)
                .collect(Collectors.toSet());
    }

    private SubmitScoreRequest valid() {
        return new SubmitScoreRequest(ChallengeMode.SPRINT, 120, 120, 98, 60, 25, "2026-10-09");
    }

    @Test
    @DisplayName("合法请求无任何违规")
    void validRequest_hasNoViolation() {
        assertThat(violations(valid())).isEmpty();
    }

    @Test
    @DisplayName("mode 为空被拦下")
    void nullMode_isRejected() {
        SubmitScoreRequest request = new SubmitScoreRequest(null, 10, 10, 90, 30, 5, "2026-10-09");
        assertThat(violations(request)).contains("mode");
    }

    @Test
    @DisplayName("分数 / 字数 / 连击超出上限被拦下")
    void oversizedNumbers_areRejected() {
        assertThat(violations(new SubmitScoreRequest(ChallengeMode.SPRINT, 10001, 1, 90, 30, 5, "2026-10-09")))
                .contains("score");
        assertThat(violations(new SubmitScoreRequest(ChallengeMode.SPRINT, 1, 10001, 90, 30, 5, "2026-10-09")))
                .contains("correctChars");
        assertThat(violations(new SubmitScoreRequest(ChallengeMode.SPRINT, 1, 1, 90, 30, 10001, "2026-10-09")))
                .contains("maxCombo");
    }

    @Test
    @DisplayName("负数与超长用时被拦下")
    void negativeAndOversizedDuration_areRejected() {
        assertThat(violations(new SubmitScoreRequest(ChallengeMode.SPRINT, -1, 1, 90, 30, 5, "2026-10-09")))
                .contains("score");
        assertThat(violations(new SubmitScoreRequest(ChallengeMode.SPRINT, 1, 1, 90, 7201, 5, "2026-10-09")))
                .contains("durationSec");
    }

    @Test
    @DisplayName("准确率必须是 0~100 的百分数")
    void accuracyPercent_range() {
        assertThat(violations(new SubmitScoreRequest(ChallengeMode.SPRINT, 1, 1, 101, 30, 5, "2026-10-09")))
                .contains("accuracyPercent");
        assertThat(violations(new SubmitScoreRequest(ChallengeMode.SPRINT, 1, 1, -1, 30, 5, "2026-10-09")))
                .contains("accuracyPercent");
    }

    @Test
    @DisplayName("statDate 必须是 YYYY-MM-DD，且不能为空")
    void statDate_format() {
        assertThat(violations(new SubmitScoreRequest(ChallengeMode.SPRINT, 1, 1, 90, 30, 5, "2026/10/09")))
                .contains("statDate");
        assertThat(violations(new SubmitScoreRequest(ChallengeMode.SPRINT, 1, 1, 90, 30, 5, null)))
                .contains("statDate");
    }
}
