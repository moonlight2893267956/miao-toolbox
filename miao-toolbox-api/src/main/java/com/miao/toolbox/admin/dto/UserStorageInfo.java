package com.miao.toolbox.admin.dto;

import lombok.Builder;
import lombok.Getter;

/**
 * 用户存储用量信息
 */
@Getter
@Builder
public class UserStorageInfo {
    private Long userId;
    private String username;
    private long usedBytes;
    private long quotaBytes;
    private double percentage;
}
