package com.miao.toolbox.tool.scheduler.executor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.tool.scheduler.dto.PresetTemplateResponse;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.PresetTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 预置运维模板执行器（FR-5）——按 {@code template} 分发到对应 {@link PresetTemplateHandler}。
 *
 * <p>不发起外部请求，不受 SSRF 限制；内部操作（如清理执行日志）直接访问数据库。
 *
 * <p>handler 注册：Spring 注入全部 {@link PresetTemplateHandler} Bean，
 * 按 {@code templateCode()} 建立 Map；未知模板返回 FAILED。
 */
@Slf4j
@Component
public class PresetTaskExecutor implements TaskExecutor {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Map<String, PresetTemplateHandler> handlers;

    public PresetTaskExecutor(List<PresetTemplateHandler> handlers) {
        this.handlers = new LinkedHashMap<>();
        for (PresetTemplateHandler handler : handlers) {
            String code = handler.templateCode();
            if (this.handlers.containsKey(code)) {
                log.warn("duplicate preset template handler for '{}', overwritten by {}", code, handler.getClass().getName());
            }
            this.handlers.put(code, handler);
        }
        log.info("preset template handlers registered: {}", this.handlers.keySet());
    }

    /** 模板列表（GET /preset-templates）：注册的模板元信息，供前端动态渲染。 */
    public List<PresetTemplateResponse> listTemplates() {
        return handlers.values().stream()
                .map(h -> PresetTemplateResponse.builder()
                        .code(h.templateCode())
                        .name(h.displayName())
                        .description(h.description())
                        .params(h.paramSchema())
                        .build())
                .toList();
    }

    @Override
    public TargetType supports() {
        return TargetType.PRESET;
    }

    @Override
    public ExecutionResult execute(ScheduledTask task) {
        String requestSummary = null;
        PresetTargetConfig config = null;

        if (task.getTargetConfig() instanceof PresetTargetConfig c) {
            config = c;
            requestSummary = buildRequestSummary(c);
        }

        if (config == null || config.getTemplate() == null || config.getTemplate().isBlank()) {
            return ExecutionResult.of(ExecutionStatus.FAILED, requestSummary, null,
                    "预置模板目标缺少 template 配置");
        }

        String templateCode = config.getTemplate().trim();
        PresetTemplateHandler handler = handlers.get(templateCode);
        if (handler == null) {
            return ExecutionResult.of(ExecutionStatus.FAILED, requestSummary, null,
                    "未知预置模板: " + templateCode);
        }

        try {
            PresetTemplateHandler.PresetExecutionResult result = handler.execute(config);
            log.info("[task:{}] preset executed template={} status={}",
                    task.getId(), templateCode, result.status());
            return ExecutionResult.of(result.status(), requestSummary, result.responseSummary(),
                    result.errorMessage());
        } catch (Exception e) {
            // 双保险：handler 内部已 catch，此处兜底防未预期异常逃逸
            log.error("[task:{}] preset execution unexpected error template={}", task.getId(), templateCode, e);
            return ExecutionResult.of(ExecutionStatus.FAILED, requestSummary, null,
                    "执行异常: " + e.getMessage());
        }
    }

    /** 请求摘要 JSON：模板代码 + 参数快照（无敏感字段，原样记录）。 */
    private String buildRequestSummary(PresetTargetConfig config) {
        try {
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("template", config.getTemplate() == null ? "" : config.getTemplate());
            summary.put("params", config.getParams() == null ? Map.of() : config.getParams());
            return MAPPER.writeValueAsString(summary);
        } catch (Exception e) {
            log.warn("preset request summary build failed: {}", e.getMessage());
            return null;
        }
    }
}
