package com.miao.toolbox.storage.model;

import lombok.Builder;
import lombok.Data;

/**
 * COS 对象操作结果
 */
@Data
@Builder
public class CosObjectResult {

    /**
     * COS 对象 ETag
     */
    private String eTag;

    /**
     * COS key
     */
    private String key;
}
