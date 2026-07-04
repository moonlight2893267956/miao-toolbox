package com.miao.toolbox.observability;

import com.miao.toolbox.common.exception.BusinessException;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * miao-ai Agent 平台统一配置。
 *
 * <p>配置前缀: {@code miao.ai}
 *
 * <p>结构说明：
 * <pre>
 * miao:
 *   ai:
 *     agents:                          # 各 Agent 独立配置
 *       diff-explainer:
 *         enabled: true
 *         base-url: http://localhost:8000
 *         agent-name: diff-explainer
 *         api-key: xxx
 *         connect-timeout: 5000
 *         read-timeout: 60000
 *         retry-count: 2
 *         retry-interval: 1000
 *       json-repairer:
 *         enabled: true
 *         base-url: http://localhost:8000
 *         api-key: xxx
 *         connect-timeout: 5000
 *         read-timeout: 60000
 *         retry-count: 2
 *         retry-interval: 1000
 *     invocation:                      # 调用记录相关配置
 *       retention-days: 90
 *       retention-cron: "0 0 3 * * *"
 *       async:
 *         core-pool-size: 2
 *         max-pool-size: 8
 *         queue-capacity: 100
 * </pre>
 *
 * <p>新增 Agent 只需在 YAML 的 {@code miao.ai.agents} 下添加条目。
 */
@Data
@Component
@ConfigurationProperties(prefix = "miao.ai")
public class MiaoAiProperties {

    /** 各 Agent 独立配置，key 为 agent 标识（如 diff-explainer） */
    private Map<String, AgentConfig> agents = new LinkedHashMap<>();

    /** AI 输入最大字节数（默认 20KB），超限拒绝 */
    private long maxInputBytes = 20480;

    /** 调用记录相关配置 */
    private Invocation invocation = new Invocation();

    // ========== Agent 配置 ==========

    @Data
    public static class AgentConfig {
        /** 是否启用此 Agent */
        private boolean enabled = true;

        /** miao-ai 后端地址（如 http://localhost:8000） */
        private String baseUrl = "";

        /** Agent 名称（为空则使用 map key） */
        private String agentName;

        /** Agent 的 API Key（Bearer token） */
        private String apiKey = "";

        /** HTTP 连接超时（毫秒） */
        private int connectTimeout = 5000;

        /** HTTP 读取超时（毫秒），AI 生成可能较慢 */
        private int readTimeout = 60000;

        /** 请求重试次数 */
        private int retryCount = 2;

        /** 重试间隔（毫秒） */
        private long retryInterval = 1000;
    }

    // ========== 调用记录配置 ==========

    @Data
    public static class Invocation {
        /** 调用记录保留天数 */
        private int retentionDays = 90;

        /** 清理任务 cron 表达式 */
        private String retentionCron = "0 0 3 * * *";

        /** 异步线程池配置 */
        private Async async = new Async();

        @Data
        public static class Async {
            /** 核心线程数 */
            private int corePoolSize = 2;

            /** 最大线程数 */
            private int maxPoolSize = 8;

            /** 队列容量 */
            private int queueCapacity = 100;
        }
    }

    // ========== 便捷方法 ==========

    /**
     * 获取指定 Agent 的配置，不存在则抛异常。
     */
    public AgentConfig getAgent(String key) {
        AgentConfig config = agents.get(key);
        if (config == null) {
            throw new BusinessException("AI_AGENT_NOT_CONFIGURED",
                    "Agent '" + key + "' 未配置", 503);
        }
        return config;
    }

    /**
     * 获取 Agent 的有效名称：优先使用配置的 agentName，否则用 key。
     */
    public String getEffectiveAgentName(String key) {
        AgentConfig config = getAgent(key);
        return (config.getAgentName() != null && !config.getAgentName().isBlank())
                ? config.getAgentName() : key;
    }
}
