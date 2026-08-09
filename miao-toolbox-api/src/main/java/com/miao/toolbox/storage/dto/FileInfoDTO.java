package com.miao.toolbox.storage.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 文件信息 DTO — 用于 API 响应
 */
@Data
@Builder
public class FileInfoDTO {

    private Long id;
    private String fileName;
    private String path;
    private Long sizeBytes;
    private String mimeType;
    private String createdAt;
    private String updatedAt;

    /**
     * 是否已被共享给其他用户
     */
    private boolean shared;
}
