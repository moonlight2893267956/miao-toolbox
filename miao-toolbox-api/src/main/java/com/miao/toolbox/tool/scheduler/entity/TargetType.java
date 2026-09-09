package com.miao.toolbox.tool.scheduler.entity;

/**
 * 定时任务目标类型。
 *
 * <p>与 {@link TaskTargetConfig} 的 Jackson 多态判别值（@JsonSubTypes name）保持一致，
 * 数据库 target_type 列存储枚举名。
 */
public enum TargetType {
    /** 外部 HTTP 请求目标（复用 network 模块 HttpRequestExecutor） */
    HTTP,
    /** 预置运维模板目标（内部操作，不发起外部请求） */
    PRESET
}
