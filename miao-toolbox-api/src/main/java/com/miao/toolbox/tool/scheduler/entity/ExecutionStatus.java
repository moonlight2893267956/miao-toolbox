package com.miao.toolbox.tool.scheduler.entity;

/**
 * 单次任务执行结果状态。
 */
public enum ExecutionStatus {
    /** 执行成功（HTTP 2xx / 模板执行无异常） */
    SUCCESS,
    /** 执行失败（非 2xx / 连接错误 / 模板异常） */
    FAILED,
    /** 执行超时（超过任务配置的超时时间） */
    TIMEOUT,
    /** 跳过（到点触发时上一次执行尚未完成，skip 重叠策略） */
    SKIPPED
}
