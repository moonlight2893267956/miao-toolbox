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
public class DiffHunk {

    /** 变更类型: added | removed | modified | unchanged */
    private String type;

    /** 原文起始行号 */
    private int oldStart;

    /** 原文行数 */
    private int oldLines;

    /** 新文起始行号 */
    private int newStart;

    /** 新文行数 */
    private int newLines;

    /** 变更明细列表 */
    private List<DiffChange> changes;
}
