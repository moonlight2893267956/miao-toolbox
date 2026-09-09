package com.miao.toolbox.tool.scheduler.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * HTTP 请求目标配置（FR-3/FR-4）。
 *
 * <p>执行时由 HttpTaskExecutor 适配为 network 模块 {@code HttpRequestExecutor.Spec}；
 * {@code headers} 中 sensitive=true 的 value 在持久化前由 SchedulerCryptoService 加密。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public final class HttpTargetConfig implements TaskTargetConfig {

    /** HTTP 方法：GET / POST / PUT / DELETE */
    private String method;

    /** 目标 URL（仅 http/https，保存时经 SSRF 校验） */
    private String url;

    /** 请求头列表（sensitive=true 的 value 加密存储、展示脱敏） */
    private List<TargetHeader> headers;

    /** 请求体（支持 {{now}}/{{taskName}}/{{taskId}} 变量模板） */
    private String body;

    /** 单次执行超时（秒），默认 30，最大 120 */
    private Integer timeoutSeconds;
}
