package com.miao.toolbox.tool.scheduler.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("CronSupport 规范化与下次执行时间")
class CronSupportTest {

    @DisplayName("6 位表达式原样返回")
    @Test
    void sixFieldKeptAsIs() {
        assertThat(CronSupport.normalize("0 0 3 * * *")).isEqualTo("0 0 3 * * *");
        assertThat(CronSupport.normalize("*/5 * * * * *")).isEqualTo("*/5 * * * * *");
    }

    @DisplayName("5 位 Unix 方言前补秒字段 0")
    @Test
    void fiveFieldNormalized() {
        assertThat(CronSupport.normalize("*/5 * * * *")).isEqualTo("0 */5 * * * *");
        assertThat(CronSupport.normalize("0 3 * * *")).isEqualTo("0 0 3 * * *");
    }

    @DisplayName("非法表达式返回 null")
    @Test
    void invalidReturnsNull() {
        assertThat(CronSupport.normalize("not-a-cron")).isNull();
        assertThat(CronSupport.normalize("99 99 * * *")).isNull();
        assertThat(CronSupport.normalize(null)).isNull();
        assertThat(CronSupport.normalize("")).isNull();
    }

    @DisplayName("nextRuns 返回按序递增的 count 个时间点（每天 3 点）")
    @Test
    void nextRunsIncrementing() {
        List<LocalDateTime> runs = CronSupport.nextRuns("0 0 3 * * *", "Asia/Shanghai", 5);

        assertThat(runs).hasSize(5);
        assertThat(runs).isSorted();
        for (LocalDateTime run : runs) {
            assertThat(run.getHour()).isEqualTo(3);
            assertThat(run.getMinute()).isZero();
        }
    }

    @DisplayName("nextRuns 无效输入返回空列表")
    @Test
    void nextRunsInvalidReturnsEmpty() {
        assertThat(CronSupport.nextRuns("bad", "Asia/Shanghai", 5)).isEmpty();
        assertThat(CronSupport.nextRuns("0 0 3 * * *", "Bad/Zone", 5)).isEmpty();
    }

    @DisplayName("nextRuns 尊重时区：各时区结果均为本地 3 点（UTC 3 点 = 上海 11 点）")
    @Test
    void nextRunsRespectsTimezone() {
        List<LocalDateTime> shanghai = CronSupport.nextRuns("0 0 3 * * *", "Asia/Shanghai", 1);
        List<LocalDateTime> tokyo = CronSupport.nextRuns("0 0 3 * * *", "Asia/Tokyo", 1);
        List<LocalDateTime> utc = CronSupport.nextRuns("0 0 3 * * *", "UTC", 1);

        // 各时区的"本地 3 点"
        assertThat(shanghai.get(0).toLocalTime()).isEqualTo(LocalTime.of(3, 0));
        assertThat(tokyo.get(0).toLocalTime()).isEqualTo(LocalTime.of(3, 0));
        assertThat(utc.get(0).toLocalTime()).isEqualTo(LocalTime.of(3, 0));
        // 时区语义（确定性断言）：UTC 3 点换算到上海必为 11 点
        int shanghaiHourOfUtcNext = utc.get(0)
                .atZone(java.time.ZoneId.of("UTC"))
                .withZoneSameInstant(java.time.ZoneId.of("Asia/Shanghai"))
                .getHour();
        assertThat(shanghaiHourOfUtcNext).isEqualTo(11);
    }
}
