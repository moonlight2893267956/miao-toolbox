package com.miao.toolbox.storage.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 预签名 URL DTO
 */
@Data
@Builder
public class PresignedUrlDTO {

    private String url;
    private int expirySeconds;
}
