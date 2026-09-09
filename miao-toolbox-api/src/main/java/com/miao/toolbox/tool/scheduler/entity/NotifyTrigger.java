package com.miao.toolbox.tool.scheduler.entity;

/**
 * 通知触发条件（FR-10/FR-11）。
 *
 * <p>默认 ON_FAILURE（仅失败时通知）。
 */
public enum NotifyTrigger {
    /** 每次执行都通知 */
    ALWAYS,
    /** 仅失败时通知（默认） */
    ON_FAILURE,
    /** 仅成功时通知 */
    ON_SUCCESS
}
