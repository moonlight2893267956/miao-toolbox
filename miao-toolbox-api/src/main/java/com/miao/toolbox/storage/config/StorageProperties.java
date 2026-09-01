package com.miao.toolbox.storage.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 文件存储服务配置属性
 * 前缀：miao.storage
 * COS 连接配置复用 miao.cos.*（CosProperties），此处仅定义存储业务相关参数
 */
@Data
@Component
@ConfigurationProperties(prefix = "miao.storage")
public class StorageProperties {

    /**
     * COS key 前缀根目录
     */
    private String basePath = "files";

    /**
     * 单文件大小上限（字节），默认 100MB
     */
    private long maxFileSize = 100 * 1024 * 1024L;

    /**
     * 预签名 URL 过期时间（秒），默认 1 小时
     */
    private int presignedUrlExpiry = 3600;

    /**
     * 新用户默认存储配额（字节），默认 1GB
     */
    private long defaultQuotaBytes = 1073741824L;

    /**
     * 文本预览大小限制（字节），默认 1MB
     */
    private long textPreviewSizeLimit = 1024 * 1024L;

    /**
     * 外链分享配置（PRD §4.12）
     */
    private Share share = new Share();

    /**
     * 孤立文件清理任务配置（OrphanFileCleanupJob）
     */
    private OrphanCleanup orphanCleanup = new OrphanCleanup();

    /**
     * 孤立文件清理相关配置
     * <p>
     * Nacos 中对应 miao.storage.orphan-cleanup.*。该任务会删除 COS 上"数据库无对应记录"的对象，
     * 具有一定危险性，默认开启保护期与熔断阈值，禁止裸删。
     */
    @Data
    public static class OrphanCleanup {

        /**
         * 是否启用清理任务（false 时整个 Bean 不注册）
         */
        private boolean enabled = true;

        /**
         * 干跑模式：只记录日志，不真正删除（排查期建议打开）
         */
        private boolean dryRun = false;

        /**
         * 执行 cron，默认每天凌晨 3 点
         */
        private String cron = "0 0 3 * * ?";

        /**
         * 保护期（小时）：lastModified 距今不足该时长的对象一律跳过
         * <p>
         * 目的：避免误删"刚上传/刚 copy 完但数据库记录尚未提交"的在途文件。
         */
        private int gracePeriodHours = 48;

        /**
         * 单次任务最大删除数量，达到上限即中止（防止批量误删扩大影响面）
         */
        private int maxDeletePerRun = 500;

        /**
         * 熔断阈值：孤儿数 / 扫描总数 超过该比例时中止整个任务（可能数据库异常或多环境共用 bucket）
         * <p>
         * 设为 1 或更大表示关闭熔断。
         */
        private double abortOrphanRatio = 0.5;

        /**
         * 熔断生效的最小扫描量（扫描数低于该值时不按比例熔断，避免少量文件误触发）
         */
        private int abortMinScanned = 20;
    }

    /**
     * 外链分享相关配置
     * <p>
     * 全部为非敏感业务配置，不引入任何密钥。Nacos 中对应 miao.storage.share.*。
     */
    @Data
    public static class Share {

        /**
         * 单文件可分享的体积上限（字节），默认 200MB
         */
        private long maxFileSize = 200 * 1024 * 1024L;

        /**
         * 禁止分享的 MIME 类型（精确匹配或前缀匹配，前缀以 * 结尾）
         */
        private List<String> forbiddenMimeTypes = List.of();

        /**
         * 链接码长度，默认 10 位
         */
        private int shareCodeLength = 10;

        /**
         * 提取码长度，默认 4 位
         */
        private int accessCodeLength = 4;

        /**
         * 默认有效期（天），null 表示默认永久。前端可选 1/7/30/永久
         */
        private Integer defaultExpireDays = null;

        /**
         * 访问次数上限允许设置的最大值，防止设置成无意义的大数，默认 1000
         */
        private int maxVisitsLimit = 1000;

        /**
         * 访问票据有效期（分钟），默认 30 分钟
         */
        private int ticketTtlMinutes = 30;

        /**
         * 同一 shareCode + IP 在窗口内允许的提取码校验失败次数，默认 5 次
         */
        private int maxUnlockFailAttempts = 5;

        /**
         * 提取码校验失败计数窗口（分钟），默认 10 分钟
         */
        private int unlockFailWindowMinutes = 10;
    }
}
