package com.miao.toolbox.tool.scheduler.executor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.tool.scheduler.entity.PresetTargetConfig;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 清理过期执行日志模板（FR-5 / FR-8）。
 *
 * <p>删除 {@code task_executions} 表中 {@code triggered_at < now - retentionDays} 的记录。
 * bulk DELETE，单事务提交；删除条数记入 responseSummary。
 *
 * <p>参数：{@code retentionDays}（int，默认 30，范围 1-365）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CleanExecutionLogsHandler implements PresetTemplateHandler {

    public static final String TEMPLATE_CODE = "CLEAN_EXECUTION_LOGS";
    private static final String PARAM_RETENTION_DAYS = "retentionDays";
    private static final int DEFAULT_RETENTION_DAYS = 30;
    private static final int MIN_RETENTION_DAYS = 1;
    private static final int MAX_RETENTION_DAYS = 365;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final TaskExecutionRepository executionRepository;

    @Override
    public String templateCode() {
        return TEMPLATE_CODE;
    }

    @Override
    public String displayName() {
        return "清理过期执行日志";
    }

    @Override
    public String description() {
        return "删除指定天数之前的任务执行记录，控制 task_executions 表体量";
    }

    @Override
    public Map<String, String> paramSchema() {
        Map<String, String> schema = new LinkedHashMap<>();
        schema.put(PARAM_RETENTION_DAYS, "int: 留存天数（1-365，默认 30）");
        return schema;
    }

    @Override
    @Transactional
    public PresetExecutionResult execute(PresetTargetConfig config) {
        try {
            int retentionDays = extractRetentionDays(config.getParams());
            LocalDateTime before = LocalDateTime.now().minusDays(retentionDays);

            long deleted = executionRepository.deleteByTriggeredAtBefore(before);

            String responseSummary = buildResponseSummary(retentionDays, before, deleted);
            log.info("cleanExecutionLogs: retentionDays={} before={} deleted={}", retentionDays, before, deleted);
            return PresetExecutionResult.success(responseSummary);
        } catch (Exception e) {
            log.error("cleanExecutionLogs failed: {}", e.getMessage(), e);
            return PresetExecutionResult.failed(e.getMessage());
        }
    }

    private int extractRetentionDays(Map<String, Object> params) {
        if (params == null || params.isEmpty()) {
            return DEFAULT_RETENTION_DAYS;
        }
        Object raw = params.get(PARAM_RETENTION_DAYS);
        if (raw == null) {
            return DEFAULT_RETENTION_DAYS;
        }
        int value;
        try {
            if (raw instanceof Number num) {
                value = num.intValue();
            } else {
                value = Integer.parseInt(String.valueOf(raw).trim());
            }
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(
                    "参数 retentionDays 不是有效整数: " + raw);
        }
        if (value < MIN_RETENTION_DAYS || value > MAX_RETENTION_DAYS) {
            throw new IllegalArgumentException(
                    "参数 retentionDays 范围 " + MIN_RETENTION_DAYS + "-" + MAX_RETENTION_DAYS + "，实际: " + value);
        }
        return value;
    }

    private String buildResponseSummary(int retentionDays, LocalDateTime before, long deleted) {
        try {
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("template", TEMPLATE_CODE);
            summary.put("retentionDays", retentionDays);
            summary.put("cutoff", before.toString());
            summary.put("deleted", deleted);
            return MAPPER.writeValueAsString(summary);
        } catch (Exception e) {
            log.warn("cleanExecutionLogs response summary build failed: {}", e.getMessage());
            return null;
        }
    }
}
