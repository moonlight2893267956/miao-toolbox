package com.miao.toolbox.observability.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * miao-ai invoke 响应 DTO（通用）。
 *
 * 解析 miao-ai 的 { "output": {...}, "trace_id": "..." } 格式。
 * 包含 token usage 信息（usage 字段可能缺失，此时 tokens 为 null）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MiaoAiInvokeResponse {

    /** 运行模式 */
    private String mode;

    /** 分析结果（结构化 JSON 或纯文本） */
    private Object output;

    /** 使用的 LLM 模型名称 */
    private String model;

    /** Langfuse trace ID */
    private String traceId;

    /** 端到端耗时（ms） */
    private Integer latencyMs;

    /** 输入 token 数（可能为 null） */
    private Integer promptTokens;

    /** 输出 token 数（可能为 null） */
    private Integer completionTokens;

    /** 总 token 数（可能为 null） */
    private Integer totalTokens;

    /**
     * 会话 ID（多轮对话）。
     *
     * miao-ai 只在请求带了 conversation_id 时返回它；不带的单轮调用为 null。
     * 下一次追问要把它原样带回，平台才能接上历史。
     */
    private String conversationId;

    /** 本会话内的轮次号，从 1 开始（未启用会话时为 null） */
    private Integer turn;

    /** 历史是否因超长被裁剪（裁剪后 agent 只看得到最近若干轮） */
    private Boolean historyTruncated;

    /** 错误信息 */
    private String error;
}
