package com.miao.toolbox.tool.scheduler.executor;

import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;

/**
 * 一次任务执行的结果（执行器返回，ExecutionEngine 落库）。
 *
 * <p>{@code requestSummary} / {@code responseSummary} 为 JSON 文本
 * （结构见 HttpTaskExecutor），敏感字段已在生成时脱敏。
 *
 * <p>契约：执行器内部消化所有异常并返回本对象，绝不向调度/执行线程抛出——
 * 调度线程异常会导致 ThreadPoolTaskScheduler 静默停止调度（架构反模式）。
 */
public record ExecutionResult(
        ExecutionStatus status,
        String requestSummary,
        String responseSummary,
        String errorMessage
) {
    public static ExecutionResult of(ExecutionStatus status, String requestSummary,
                                     String responseSummary, String errorMessage) {
        return new ExecutionResult(status, requestSummary, responseSummary, errorMessage);
    }
}
