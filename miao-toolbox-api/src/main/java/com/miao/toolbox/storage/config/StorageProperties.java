package com.miao.toolbox.storage.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

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
}
