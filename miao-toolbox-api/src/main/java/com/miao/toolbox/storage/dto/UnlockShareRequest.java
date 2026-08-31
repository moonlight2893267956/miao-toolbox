package com.miao.toolbox.storage.dto;

import lombok.Data;

/**
 * 外链分享解锁请求体（访客输入提取码）
 */
@Data
public class UnlockShareRequest {

    /** 提取码明文 */
    private String accessCode;
}
