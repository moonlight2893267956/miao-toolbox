package com.miao.toolbox.tool.scheduler.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * 预置运维模板目标配置（FR-5）。
 *
 * <p>执行时由 PresetTaskExecutor 按 {@code template} 分发到对应
 * {@code PresetTemplateHandler}；参数校验按 handler 提供的参数 schema 执行。
 * 内部操作不发起外部请求，不受 SSRF 限制。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public final class PresetTargetConfig implements TaskTargetConfig {

    /** 模板代码（v1 仅 CLEAN_EXECUTION_LOGS） */
    private String template;

    /** 模板参数（如 retentionDays=30），按模板参数 schema 校验 */
    private Map<String, Object> params;
}
