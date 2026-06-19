package com.miao.toolbox.tool.diff;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DiffResult {

    /** 差异统计 */
    private DiffStatistics statistics;

    /** 差异块列表 */
    private List<DiffHunk> hunks;

    /** 识别的文件语言类型 */
    private String language;

    /** COS 文件 Key 列表（上传模式时返回） */
    private List<String> fileKeys;
}
