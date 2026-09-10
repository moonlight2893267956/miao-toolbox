package com.miao.toolbox.tool.scheduler.util;

import org.springframework.scheduling.support.CronExpression;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * cron 表达式支撑工具（FR-2）——规范化与下次执行时间计算。
 *
 * <p>Spring {@link CronExpression} 仅支持 6 位（秒 分 时 日 月 周）；
 * {@link #normalize(String)} 把 5 位 Unix 方言自动前补秒字段 0，
 * 返回统一可存储/调度的 6 位表达式。
 */
public final class CronSupport {

    private CronSupport() {
    }

    /**
     * 校验并规范化 cron 表达式：6 位原样返回；5 位前补 "0 " 转 6 位；
     * 其他无效输入返回 null（调用方负责抛业务异常）。
     */
    public static String normalize(String expression) {
        if (expression == null) {
            return null;
        }
        String trimmed = expression.trim();
        if (CronExpression.isValidExpression(trimmed)) {
            return trimmed;
        }
        String sixField = "0 " + trimmed;
        if (!trimmed.isEmpty() && trimmed.split("\\s+").length == 5
                && CronExpression.isValidExpression(sixField)) {
            return sixField;
        }
        return null;
    }

    /**
     * 计算规范化 6 位表达式的下次 count 次执行时间（基于时区）。
     * 表达式非法或时区无效返回空列表。
     */
    public static List<LocalDateTime> nextRuns(String normalizedCron, String timezone, int count) {
        List<LocalDateTime> runs = new ArrayList<>();
        try {
            ZoneId zone = ZoneId.of(timezone);
            CronExpression expression = CronExpression.parse(normalizedCron);
            LocalDateTime cursor = LocalDateTime.now(zone);
            for (int i = 0; i < count; i++) {
                LocalDateTime next = expression.next(cursor);
                if (next == null) {
                    break;
                }
                runs.add(next);
                cursor = next;
            }
        } catch (Exception ignored) {
            // 非法输入返回空列表，调用方以 valid=false 呈现
        }
        return runs;
    }
}
