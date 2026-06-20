package com.miao.toolbox.tool.diff;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FileUploadResult {

    /** COS 文件 Key */
    private String fileKey;

    /** 原始文件名 */
    private String fileName;

    /** 文件大小（字节） */
    private long size;
}
