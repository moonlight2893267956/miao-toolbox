package com.miao.toolbox.storage.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 外链分享记录响应 DTO（管理侧，仅分享者本人可见）
 * <p>
 * 注意：accessCode 明文仅在创建响应中返回一次，列表接口不返回该字段。
 */
@Data
@Builder
public class ShareLinkDTO {

    private Long id;
    private String shareCode;
    private Long fileId;
    private String fileName;
    private Long sizeBytes;
    private String mimeType;

    /**
     * 分享地址的相对路径 {@code /s/{shareCode}}。
     * 后端不感知部署域名，前端展示时用 {@code window.location.origin} 拼接成完整地址。
     */
    private String shareUrl;

    /** 明文提取码，仅创建时返回一次 */
    private String accessCode;

    private String expiresAt;
    private Integer maxVisits;
    private Integer visitCount;
    private Boolean revoked;

    /** ACTIVE / EXPIRED / EXHAUSTED / REVOKED */
    private String status;

    private String createdAt;
}
