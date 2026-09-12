package com.miao.toolbox.tool.scheduler.executor;

import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;

/**
 * 任务执行器策略接口。
 *
 * <p><b>契约（架构执行指南）：</b>实现类必须内部 catch 全部异常并返回 {@link ExecutionResult}，
 * 不得向调用方（执行线程）抛出异常。
 */
public interface TaskExecutor {

    /**
     * 执行任务目标。实现类保证不抛异常。
     */
    ExecutionResult execute(ScheduledTask task);
}
