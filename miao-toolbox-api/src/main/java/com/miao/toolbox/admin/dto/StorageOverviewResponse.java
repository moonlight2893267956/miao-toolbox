package com.miao.toolbox.admin.dto;

import java.util.List;
import lombok.Builder;
import lombok.Getter;

/**
 * 管理员存储概览响应
 */
@Getter
@Builder
public class StorageOverviewResponse {
    /** 全局总用量（字节） */
    private long totalBytes;
    /** 全局文件总数 */
    private long totalFiles;
    /** 用户总数 */
    private long userCount;
    /** 用户存储用量列表（按用量降序） */
    private List<UserStorageInfo> users;
    /** 文件类型分布 */
    private List<MimeTypeDistribution> typeDistribution;
}
