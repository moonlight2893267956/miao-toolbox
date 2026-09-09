package com.miao.toolbox.tool.scheduler.entity;

/**
 * 定时任务启停状态。
 *
 * <p>删除为物理删除（含执行记录级联删除），不设 DELETED 状态。
 */
public enum TaskStatus {
    /** 启用：参与调度触发 */
    ENABLED,
    /** 暂停：不触发执行，配置保留 */
    PAUSED
}
