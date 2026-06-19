package com.miao.toolbox.tool.diff;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FormatResponse {

    /** 格式化后的文本 */
    private String formatted;

    /** 回显目标语言 */
    private String language;

    /** 格式化后行数 */
    private int lines;

    /** 格式化后字节数（UTF-8） */
    private long bytes;
}
