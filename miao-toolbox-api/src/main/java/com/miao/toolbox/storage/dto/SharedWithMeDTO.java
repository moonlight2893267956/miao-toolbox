package com.miao.toolbox.storage.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 共享给我的文件 DTO
 */
@Data
@Builder
public class SharedWithMeDTO {

    private Long shareId;
    private Long fileId;
    private String fileName;
    private String path;
    private Long sizeBytes;
    private String mimeType;
    private String permission;
    private Long ownerUserId;
    private String ownerUsername;
    private String sharedAt;
}
