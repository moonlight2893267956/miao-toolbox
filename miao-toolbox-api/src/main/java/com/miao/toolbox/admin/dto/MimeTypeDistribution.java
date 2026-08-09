package com.miao.toolbox.admin.dto;

import lombok.Builder;
import lombok.Getter;

/**
 * MIME 类型分布统计
 */
@Getter
@Builder
public class MimeTypeDistribution {
    /** 类型分组（image, text, video, audio, other） */
    private String type;
    /** 文件数量 */
    private long count;
    /** 总字节数 */
    private long totalBytes;
}
