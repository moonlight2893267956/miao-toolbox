package com.miao.toolbox.tool.scheduler.entity;

/**
 * 执行触发类型。
 *
 * <p>手动触发不影响 cron 调度的下次执行时间（FR-6）。
 */
public enum TriggerType {
    /** cron 调度触发 */
    SCHEDULED,
    /** 管理员手动触发（立即执行） */
    MANUAL
}
