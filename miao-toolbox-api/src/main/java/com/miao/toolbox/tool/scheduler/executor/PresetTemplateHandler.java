package com.miao.toolbox.tool.scheduler.executor;

import com.miao.toolbox.tool.scheduler.entity.PresetTargetConfig;

import java.util.List;
import java.util.Map;

/**
 * 预置运维模板处理器策略接口（FR-5）。
 *
 * <p>每个模板代码（如 {@code CLEAN_EXECUTION_LOGS}）对应一个实现，
 * 由 {@link PresetTaskExecutor} 按 {@code template} 分发。
 *
 * <p><b>契约：</b>实现类必须内部 catch 全部异常并返回 {@link PresetExecutionResult}，
 * 不得向执行线程抛出——与 {@link TaskExecutor} 契约一致。
 */
public interface PresetTemplateHandler {

    /** 本处理器支持的模板代码（如 "CLEAN_EXECUTION_LOGS"） */
    String templateCode();

    /** 模板参数 schema：参数名 → 描述（供前端渲染与后端校验参考） */
    Map<String, String> paramSchema();

    /**
     * 执行模板逻辑。
     *
     * @param config 目标配置（含 template + params）
     * @return 执行结果（status / responseSummary / errorMessage）
     */
    PresetExecutionResult execute(PresetTargetConfig config);

    /**
     * 模板执行结果（内部记录，由 PresetTaskExecutor 转换为 ExecutionResult）。
     *
     * @param status 执行状态
     * @param responseSummary 响应摘要（JSON 文本，如 {"deleted": 128}）
     * @param errorMessage 失败时的错误信息（成功时为 null）
     */
    record PresetExecutionResult(
            com.miao.toolbox.tool.scheduler.entity.ExecutionStatus status,
            String responseSummary,
            String errorMessage
    ) {
        public static PresetExecutionResult success(String responseSummary) {
            return new PresetExecutionResult(
                    com.miao.toolbox.tool.scheduler.entity.ExecutionStatus.SUCCESS, responseSummary, null);
        }

        public static PresetExecutionResult failed(String errorMessage) {
            return new PresetExecutionResult(
                    com.miao.toolbox.tool.scheduler.entity.ExecutionStatus.FAILED, null, errorMessage);
        }
    }
}
