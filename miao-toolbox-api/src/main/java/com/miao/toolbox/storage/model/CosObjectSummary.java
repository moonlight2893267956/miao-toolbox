package com.miao.toolbox.storage.model;

import lombok.Builder;
import lombok.Data;

/**
 * COS 对象摘要信息
 */
@Data
@Builder
public class CosObjectSummary {

    /**
     * COS key
     */
    private String key;

    /**
     * 文件大小（字节）
     */
    private long size;

    /**
     * 最后修改时间（epoch millis）
     */
    private long lastModified;
}
