package com.miao.toolbox.storage.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 外链分享公开信息 DTO（访客侧，免登可见）
 * <p>
 * 安全约束：不返回提取码、不返回分享者的隐私信息（仅展示昵称）。
 */
@Data
@Builder
public class ShareInfoDTO {

    private String shareCode;
    private String fileName;
    private Long sizeBytes;
    private String mimeType;

    /** 分享者昵称，可能为 null */
    private String ownerName;

    /** 失效时间，null 表示永久有效 */
    private String expiresAt;

    /** 当前状态：ACTIVE / EXPIRED / EXHAUSTED / REVOKED */
    private String status;
}
