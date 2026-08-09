package com.miao.toolbox.storage.job;

import com.miao.toolbox.storage.config.StorageProperties;
import com.miao.toolbox.storage.model.CosObjectSummary;
import com.miao.toolbox.storage.repository.FileRepository;
import com.miao.toolbox.storage.service.StorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 孤立文件清理定时任务
 * <p>
 * 定期扫描 COS 上的文件，清理数据库中无对应记录的孤立文件。
 * 场景：上传成功但数据库写入失败（事务回滚），或删除数据库记录后 COS 删除失败。
 * <p>
 * 执行频率：每天凌晨 3 点
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrphanFileCleanupJob {

    private final StorageService storageService;
    private final StorageProperties storageProperties;
    private final FileRepository fileRepository;

    /**
     * 每天凌晨 3 点执行清理
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void cleanupOrphanFiles() {
        log.info("开始清理孤立文件...");
        int cleanedCount = 0;

        try {
            // 获取 COS 上所有文件
            String prefix = storageProperties.getBasePath();
            List<CosObjectSummary> cosFiles = storageService.listObjects(prefix);

            for (CosObjectSummary cosFile : cosFiles) {
                // 检查数据库中是否有对应记录
                boolean exists = fileRepository.findByCosKey(cosFile.getKey()).isPresent();
                if (!exists) {
                    log.info("发现孤立文件: key={}, size={}", cosFile.getKey(), cosFile.getSize());
                    try {
                        storageService.deleteObject(cosFile.getKey());
                        cleanedCount++;
                        log.info("已清理孤立文件: key={}", cosFile.getKey());
                    } catch (Exception e) {
                        log.error("清理孤立文件失败: key={}, error={}", cosFile.getKey(), e.getMessage());
                    }
                }
            }

            log.info("孤立文件清理完成: 扫描={}, 清理={}", cosFiles.size(), cleanedCount);
        } catch (Exception e) {
            log.error("孤立文件清理任务执行失败", e);
        }
    }
}
