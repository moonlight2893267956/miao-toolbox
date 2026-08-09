package com.miao.toolbox.storage.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 共享记录响应 DTO
 */
@Data
@Builder
public class ShareDTO {

    private Long id;
    private Long fileId;
    private Long sharedWithUserId;
    private String sharedWithUsername;
    private String permission;
    private String createdAt;
}
