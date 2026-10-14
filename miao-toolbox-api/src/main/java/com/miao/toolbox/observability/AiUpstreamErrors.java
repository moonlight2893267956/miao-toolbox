package com.miao.toolbox.observability;

/**
 * miao-ai 上游 HTTP 状态码 → 业务错误码 / 中文消息 的映射工具。
 *
 * <p>刻意做成**纯函数、无状态、无 Spring 依赖**：调用方（{@link MiaoAiClient}）
 * 只在这一个地方产出「上游返回了非 2xx」的错误，上层业务（如 WubiAiService）
 * 再按这些错误码做语义映射。把映射集中在这里，好处是：
 * <ul>
 *   <li>错误码与文案可以单独单测，不需要发起任何 HTTP 调用；</li>
 *   <li>语义化（410 = 会话过期、409 = 并发上一轮未完成、429 = 配额）只写一次，
 *       不会散落在各个调用方；</li>
 *   <li>所有 agent 共用同一套错误码，观测面板可按码聚合。</li>
 * </ul>
 *
 * <p>错误码形如 {@code AI_UPSTREAM_410} / {@code AI_UPSTREAM_5XX} / {@code AI_UPSTREAM_OTHER}，
 * 后缀部分即可读的状态语义，便于日志与前端排查。
 */
public final class AiUpstreamErrors {

    /** body 摘要最大字符数：上游错误体可能是整页 HTML，原样塞进消息会污染日志与响应 */
    private static final int MAX_SNIPPET_LENGTH = 200;

    /** 截断时保留的省略标记 */
    private static final String ELLIPSIS = "...";

    /** 工具类禁止实例化 */
    private AiUpstreamErrors() {
    }

    /**
     * 把上游 HTTP 状态码映射为业务错误码。
     *
     * @param status 上游返回的 HTTP 状态码
     * @return 形如 {@code AI_UPSTREAM_410} 的错误码；5xx 统一为 {@code AI_UPSTREAM_5XX}，
     *         其余未列举状态码为 {@code AI_UPSTREAM_OTHER}
     */
    public static String codeForStatus(int status) {
        return switch (status) {
            case 410 -> "AI_UPSTREAM_410";
            case 404 -> "AI_UPSTREAM_404";
            case 403 -> "AI_UPSTREAM_403";
            case 409 -> "AI_UPSTREAM_409";
            case 429 -> "AI_UPSTREAM_429";
            default -> isServerError(status) ? "AI_UPSTREAM_5XX" : "AI_UPSTREAM_OTHER";
        };
    }

    /**
     * 生成中文可读的上游错误消息，**必须保留状态码**（日志排查靠它定位）。
     *
     * <p>返回形如 {@code miao-ai 返回 410（会话已过期）：<snippet>}；body 为空或全空白时
     * 省略冒号与摘要部分。摘要最长 {@value #MAX_SNIPPET_LENGTH} 字符，超出截断。
     *
     * @param status      上游返回的 HTTP 状态码
     * @param bodySnippet 上游响应体（可为 null，调用方通常直接传整段 body）
     * @return 中文错误消息，永不为 null
     */
    public static String messageForStatus(int status, String bodySnippet) {
        String message = "miao-ai 返回 " + status + "（" + reasonForStatus(status) + "）";
        String snippet = truncateSnippet(bodySnippet);
        return snippet == null ? message : message + "：" + snippet;
    }

    // ========== 私有方法 ==========

    /** 5xx：服务端错误。按 HTTP 定义取 500-599，避免把 600+ 之类的异常值误判 */
    private static boolean isServerError(int status) {
        return status >= 500 && status <= 599;
    }

    /** 状态码对应的人类可读原因，与 {@link #codeForStatus(int)} 的枚举保持一致 */
    private static String reasonForStatus(int status) {
        return switch (status) {
            case 410 -> "会话已过期";
            case 404 -> "会话或 Agent 不存在";
            case 403 -> "无权访问该会话";
            case 409 -> "上一轮还在处理中";
            case 429 -> "额度已用完或触发限流";
            default -> isServerError(status) ? "miao-ai 服务端异常" : "未预期的状态码";
        };
    }

    /**
     * 摘要截断：null / 空白 → null；超长则截到 200 字符以内（含省略号）。
     */
    private static String truncateSnippet(String bodySnippet) {
        if (bodySnippet == null) {
            return null;
        }
        String trimmed = bodySnippet.strip();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() <= MAX_SNIPPET_LENGTH) {
            return trimmed;
        }
        return trimmed.substring(0, MAX_SNIPPET_LENGTH - ELLIPSIS.length()) + ELLIPSIS;
    }
}
