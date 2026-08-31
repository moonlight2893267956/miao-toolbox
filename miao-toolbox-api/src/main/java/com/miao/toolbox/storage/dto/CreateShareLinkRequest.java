package com.miao.toolbox.storage.dto;

import lombok.Data;

/**
 * 创建外链分享请求体
 */
@Data
public class CreateShareLinkRequest {

    /** 被分享的文件 ID */
    private Long fileId;

    /** 有效期天数：1 / 7 / 30，null 或 0 表示永久 */
    private Integer expireDays;

    /** 访问次数上限，null 或 0 表示不限 */
    private Integer maxVisits;
}
