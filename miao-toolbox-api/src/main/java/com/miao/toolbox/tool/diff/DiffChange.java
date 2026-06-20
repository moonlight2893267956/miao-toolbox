package com.miao.toolbox.tool.diff;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DiffChange {

    /** 变更类型: equal | added | removed | modified */
    private String type;

    /** 当前值 */
    private String value;

    /** 原始值（仅 modified 类型有值） */
    private String oldValue;
}
