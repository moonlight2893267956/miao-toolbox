package com.miao.toolbox.storage.job;

import com.miao.toolbox.storage.config.StorageProperties;
import com.miao.toolbox.storage.model.CosObjectSummary;
import com.miao.toolbox.storage.repository.FileRepository;
import com.miao.toolbox.storage.service.StorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 孤立文件清理定时任务
 * <p>
 * 定期扫描 COS 上的文件，清理数据库中无对应记录的孤立文件。
 * 场景：上传成功但数据库写入失败（事务回滚），或删除数据库记录后 COS 删除失败。
 * <p>
 * 执行频率：每天凌晨 3 点
 * <p>
 * <b>安全约束（务必保留）</b>：删除 COS 对象不可逆，误判会直接造成用户文件永久丢失，因此本任务包含四道闸门：
 * <ol>
 *     <li>总开关 {@code miao.storage.orphan-cleanup.enabled=false} 可整体停用；</li>
 *     <li>干跑模式 {@code dryRun=true} 仅记录不删除，排查期必备；</li>
 *     <li>保护期 {@code gracePeriodHours}：跳过近期修改过的对象，避免误删在途文件
 *     （典型场景：rename/move 先在 COS 上 copy 出新 key，数据库记录后写，窗口期内新 key 无记录）；</li>
 *     <li>熔断：孤儿占比超过 {@code abortOrphanRatio} 时中止，
 *     防止数据库异常或"多环境共用同一个 bucket"时把整个 bucket 清空。</li>
 * </ol>
 * 另：目录占位对象（key 以 / 结尾、size=0）不参与清理。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "miao.storage.orphan-cleanup", name = "enabled", havingValue = "true", matchIfMissing = true)
public class OrphanFileCleanupJob {

    /**
     * 批量校验数据库存在性的批次大小
     */
    private static final int BATCH_SIZE = 200;

    private final StorageService storageService;
    private final StorageProperties storageProperties;
    private final FileRepository fileRepository;

    /**
     * 每天凌晨 3 点执行清理
     */
    @Scheduled(cron = "${miao.storage.orphan-cleanup.cron:0 0 3 * * ?}")
    public void cleanupOrphanFiles() {
        StorageProperties.OrphanCleanup config = storageProperties.getOrphanCleanup();
        String prefix = normalizePrefix(storageProperties.getBasePath());
        log.info("开始扫描孤立文件: bucket={}, prefix={}, dryRun={}, gracePeriodHours={}, maxDeletePerRun={}",
                storageService.getBucket(), prefix,
                config.isDryRun(), config.getGracePeriodHours(), config.getMaxDeletePerRun());

        int scanned = 0;
        int orphanCount = 0;
        int deletedCount = 0;
        int skippedInGrace = 0;

        try {
            List<CosObjectSummary> cosFiles = storageService.listObjects(prefix);
            scanned = cosFiles.size();

            long graceDeadline = System.currentTimeMillis() - (long) config.getGracePeriodHours() * 3600_000L;

            // 第一遍：仅统计孤儿数量，用于熔断判断，避免边删边判断导致误删扩大
            List<CosObjectSummary> orphans = new ArrayList<>();
            for (int i = 0; i < cosFiles.size(); i += BATCH_SIZE) {
                List<CosObjectSummary> batch = cosFiles.subList(i, Math.min(i + BATCH_SIZE, cosFiles.size()));
                Set<String> existingKeys = new HashSet<>(
                        fileRepository.findExistingCosKeys(batch.stream().map(CosObjectSummary::getKey).toList()));

                for (CosObjectSummary cosFile : batch) {
                    if (existingKeys.contains(cosFile.getKey())) {
                        continue;
                    }
                    if (isDirectoryPlaceholder(cosFile)) {
                        // 目录占位对象在数据库中本就没有记录，不能当作孤儿删除
                        continue;
                    }
                    if (cosFile.getLastModified() > graceDeadline) {
                        // 在途文件（上传/复制中，或数据库记录尚未提交），保护期内跳过
                        skippedInGrace++;
                        log.warn("孤立文件处于保护期内，跳过: key={}, lastModified={}",
                                cosFile.getKey(), cosFile.getLastModified());
                        continue;
                    }
                    orphans.add(cosFile);
                }
            }
            orphanCount = orphans.size();

            // 熔断：孤儿占比异常高时，极可能是数据库异常或多环境共用 bucket，直接中止
            if (scanned >= config.getAbortMinScanned()
                    && (double) orphanCount / scanned > config.getAbortOrphanRatio()) {
                log.error("孤立文件占比异常（{}/{}），已熔断本次清理任务。"
                                + "请检查数据库连接、basePath 配置，以及是否存在多环境共用同一 bucket 的情况。",
                        orphanCount, scanned);
                return;
            }

            for (CosObjectSummary orphan : orphans) {
                if (deletedCount >= config.getMaxDeletePerRun()) {
                    log.warn("本次清理已达上限 {}，剩余 {} 个孤立文件留待下次处理",
                            config.getMaxDeletePerRun(), orphans.size() - deletedCount);
                    break;
                }
                log.info("发现孤立文件: key={}, size={}, lastModified={}",
                        orphan.getKey(), orphan.getSize(), orphan.getLastModified());
                if (config.isDryRun()) {
                    deletedCount++;
                    continue;
                }
                try {
                    storageService.deleteObject(orphan.getKey());
                    deletedCount++;
                    log.info("已清理孤立文件: key={}", orphan.getKey());
                } catch (Exception e) {
                    log.error("清理孤立文件失败: key={}, error={}", orphan.getKey(), e.getMessage());
                }
            }

            log.info("孤立文件清理完成: 扫描={}, 孤儿={}, 保护期跳过={}, {}, 清理={}",
                    scanned, orphanCount, skippedInGrace,
                    config.isDryRun() ? "dryRun=仅记录" : "实际删除", deletedCount);
        } catch (Exception e) {
            log.error("孤立文件清理任务执行失败", e);
        }
    }

    /**
     * 规范化扫描前缀，保证只扫描业务文件目录（末尾补 /）
     */
    private String normalizePrefix(String basePath) {
        if (basePath == null || basePath.isBlank()) {
            return "";
        }
        return basePath.endsWith("/") ? basePath : basePath + "/";
    }

    /**
     * 是否为 COS 目录占位对象（key 以 / 结尾且大小为 0）
     */
    private boolean isDirectoryPlaceholder(CosObjectSummary object) {
        return object.getKey().endsWith("/") && object.getSize() == 0;
    }
}
