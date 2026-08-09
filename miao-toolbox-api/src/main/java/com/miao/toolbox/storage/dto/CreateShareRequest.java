package com.miao.toolbox.storage.dto;

import lombok.Data;

/**
 * 创建共享请求体
 */
@Data
public class CreateShareRequest {

    /** 被共享用户 ID */
    private Long userId;

    /** 共享权限：VIEW / EDIT */
    private String permission;
}
