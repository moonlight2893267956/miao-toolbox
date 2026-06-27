package com.miao.toolbox.tool.diff.ai;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * miao-ai Agent 平台连接配置。
 *
 * 配置前缀: miao.ai
 * 在 application-dev.yml / application-prod.yml 中设置具体值。
 */
@Data
@Component
@ConfigurationProperties(prefix = "miao.ai")
public class MiaoAiProperties {

    /** miao-ai 后端地址（如 http://localhost:8000） */
    private String baseUrl = "";

    /** diff-explainer Agent 的 API Key（Bearer token） */
    private String apiKey = "";

    /** diff-explainer Agent 名称 */
    private String agentName = "diff-explainer";

    /** HTTP 连接超时（毫秒） */
    private int connectTimeout = 5000;

    /** HTTP 读取超时（毫秒），AI 生成可能较慢 */
    private int readTimeout = 60000;

    /** 请求重试次数 */
    private int retryCount = 2;

    /** 重试间隔（毫秒） */
    private long retryInterval = 1000;

    /** 是否启用 AI 分析功能（总开关） */
    private boolean enabled = false;
}
