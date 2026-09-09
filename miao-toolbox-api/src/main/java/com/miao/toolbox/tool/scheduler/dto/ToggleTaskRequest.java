package com.miao.toolbox.tool.scheduler.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 启停任务请求（FR-1）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ToggleTaskRequest {

    /** pause = 暂停（取消调度）；resume = 恢复（重新注册调度） */
    private String action;
}
