package com.miao.toolbox.tool.scheduler.executor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.PresetTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 预置运维模板执行器（FR-5）——v1 骨架：分发到 {@code PresetTemplateHandler} 的机制
 * 在 Story 3.1 交付（含「清理过期执行日志」首个模板）；当前所有模板执行返回 FAILED。
 */
@Slf4j
@Component
public class PresetTaskExecutor implements TaskExecutor {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public TargetType supports() {
        return TargetType.PRESET;
    }

    @Override
    public ExecutionResult execute(ScheduledTask task) {
        String requestSummary = null;
        if (task.getTargetConfig() instanceof PresetTargetConfig config) {
            try {
                requestSummary = MAPPER.writeValueAsString(java.util.Map.of(
                        "template", config.getTemplate() == null ? "" : config.getTemplate(),
                        "params", config.getParams() == null ? java.util.Map.of() : config.getParams()));
            } catch (Exception ignored) {
                // 摘要构建失败不阻断
            }
        }
        log.info("[task:{}] preset template execution pending (Story 3.1)", task.getId());
        return ExecutionResult.of(ExecutionStatus.FAILED, requestSummary, null,
                "预置运维模板执行器尚未实现（Story 3.1 交付）");
    }
}
