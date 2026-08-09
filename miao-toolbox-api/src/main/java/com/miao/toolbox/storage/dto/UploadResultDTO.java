package com.miao.toolbox.storage.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 上传结果 DTO
 */
@Data
@Builder
public class UploadResultDTO {

    private Long id;
    private String fileName;
    private String path;
    private Long sizeBytes;
    private String mimeType;
}
