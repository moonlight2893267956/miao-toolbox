package com.miao.toolbox.observability;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * AI 调用记录实体 — 对应 ai_invocations 表。
 *
 * 每次调用 miao-ai 时写入一行，记录完整的调用上下文：
 * 谁(user_id)调了哪个 agent(agent_name)，用了什么模型(model)，
 * 耗时(latency_ms)、token 消耗(prompt_tokens/completion_tokens)，
 * 以及 miao-ai 返回的 trace_id（用于 Langfuse 排查）。
 *
 * 设计决策：
 *   - 废弃 tool_id，统一以 agent_name 为主键维度（Q4=B）
 *   - 不引入 cost 字段（Q3=A，v1 只记 tokens）
 *   - 与 audit_logs 互不重叠
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "ai_invocations")
public class AiInvocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 请求唯一标识（UUID v4），由 Recorder 生成 */
    @Column(name = "request_id", nullable = false, length = 36)
    private String requestId;

    /** 调用者用户 ID */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** miao-ai Agent 名称（如 diff-explainer、translator） */
    @Column(name = "agent_name", nullable = false, length = 64)
    private String agentName;

    /** 使用的 LLM 模型名称（如 claude-sonnet-4-5） */
    @Column(name = "model", length = 64)
    private String model;

    /** 运行模式（如 fast / balanced） */
    @Column(name = "mode", length = 32)
    private String mode;

    /** 调用状态：SUCCESS / FAILURE */
    @Column(name = "status", nullable = false, length = 16)
    private String status;

    /** 失败时的错误码 */
    @Column(name = "error_code", length = 64)
    private String errorCode;

    /** 端到端耗时（毫秒） */
    @Column(name = "latency_ms", nullable = false)
    private Integer latencyMs;

    /** 输入 token 数 */
    @Column(name = "prompt_tokens")
    private Integer promptTokens;

    /** 输出 token 数 */
    @Column(name = "completion_tokens")
    private Integer completionTokens;

    /** 总 token 数 */
    @Column(name = "total_tokens")
    private Integer totalTokens;

    /** miao-ai 返回的 Langfuse trace ID */
    @Column(name = "trace_id", length = 64)
    private String traceId;

    /** 请求摘要（脱敏后，截断至 512 字符） */
    @Column(name = "request_summary", length = 512)
    private String requestSummary;

    /** 响应摘要（脱敏后，截断至 512 字符） */
    @Column(name = "response_summary", length = 512)
    private String responseSummary;

    /** 调用方 IP */
    @Column(name = "client_ip", length = 64)
    private String clientIp;

    /** 浏览器 UA */
    @Column(name = "user_agent", length = 255)
    private String userAgent;

    /** 调用时间 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
