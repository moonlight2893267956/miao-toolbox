package com.miao.toolbox.observability;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * AI 调用记录保留清理任务。
 *
 * <p>默认保留 90 天，通过 miao.ai.invocation.retention-days 配置。
 * 定时执行：每天凌晨 3 点（cron: 0 0 3 * * *）
 *
 * <p>超过 100 万行时建议改为分区表（v1 暂不实施）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiInvocationRetentionJob {

    private final AiInvocationRepository repository;
    private final MiaoAiProperties miaoAiProperties;

    /**
     * 每天凌晨 3 点清理过期调用记录。
     */
    @Scheduled(cron = "${miao.ai.invocation.retention-cron:0 0 3 * * *}")
    public void cleanup() {
        int retentionDays = miaoAiProperties.getInvocation().getRetentionDays();
        LocalDateTime before = LocalDateTime.now().minusDays(retentionDays);
        log.info("Cleaning up ai_invocations older than {} (retention={}d)", before, retentionDays);
        try {
            long deleted = repository.deleteByCreatedAtBefore(before);
            log.info("Cleaned up {} ai_invocations records older than {}", deleted, before);
        } catch (Exception e) {
            log.error("Failed to cleanup ai_invocations: {}", e.getMessage(), e);
        }
    }
}
