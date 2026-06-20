package com.miao.toolbox.tool.diff;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DiffStatistics {

    /** 新增数 */
    private int additions;

    /** 删除数 */
    private int deletions;

    /** 修改处数 */
    private int modifications;
}
