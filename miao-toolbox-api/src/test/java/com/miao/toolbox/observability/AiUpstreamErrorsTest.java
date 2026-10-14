package com.miao.toolbox.observability;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link AiUpstreamErrors} 单元测试：状态码 → 错误码 / 中文消息的映射。
 *
 * <p>纯函数，无需任何 mock 或 HTTP 调用。
 */
@DisplayName("AiUpstreamErrors 状态码映射测试")
class AiUpstreamErrorsTest {

    @ParameterizedTest(name = "状态码 {0} → {1}")
    @CsvSource({
            "410, AI_UPSTREAM_410",
            "404, AI_UPSTREAM_404",
            "403, AI_UPSTREAM_403",
            "409, AI_UPSTREAM_409",
            "429, AI_UPSTREAM_429",
            "500, AI_UPSTREAM_5XX",
            "502, AI_UPSTREAM_5XX",
            "503, AI_UPSTREAM_5XX",
            "418, AI_UPSTREAM_OTHER",
            "400, AI_UPSTREAM_OTHER",
            "200, AI_UPSTREAM_OTHER"
    })
    @DisplayName("codeForStatus：已知状态码逐一映射，5xx 归一，其余归 OTHER")
    void codeForStatus_maps(int status, String expected) {
        assertEquals(expected, AiUpstreamErrors.codeForStatus(status));
    }

    @ParameterizedTest(name = "状态码 {0} 的消息保留状态码与括号原因")
    @CsvSource({
            "410, 会话已过期",
            "404, 会话或 Agent 不存在",
            "403, 无权访问该会话",
            "409, 上一轮还在处理中",
            "429, 额度已用完或触发限流",
            "500, miao-ai 服务端异常",
            "418, 未预期的状态码"
    })
    @DisplayName("messageForStatus：中文可读且必须保留状态码")
    void messageForStatus_keepsStatus(int status, String reason) {
        String message = AiUpstreamErrors.messageForStatus(status, "body");

        assertTrue(message.contains(String.valueOf(status)), "消息必须保留状态码：" + message);
        assertTrue(message.contains(reason), "消息必须含原因：" + message);
        assertTrue(message.contains("body"), "消息必须含 body 摘要：" + message);
        assertTrue(message.startsWith("miao-ai 返回 "), "消息前缀固定：" + message);
    }

    @Test
    @DisplayName("messageForStatus：body 为 null / 空白时不拼摘要也不抛异常")
    void messageForStatus_nullAndBlankBody() {
        String nullBody = AiUpstreamErrors.messageForStatus(502, null);
        String blankBody = AiUpstreamErrors.messageForStatus(502, "   ");

        assertEquals("miao-ai 返回 502（miao-ai 服务端异常）", nullBody);
        assertEquals("miao-ai 返回 502（miao-ai 服务端异常）", blankBody);
        // null 安全：不得出现 "null" 字样
        assertFalse(nullBody.contains("null"));
    }

    @Test
    @DisplayName("messageForStatus：200 字符以内的 body 原样保留")
    void messageForStatus_shortBodyKept() {
        String body = "x".repeat(200);

        String message = AiUpstreamErrors.messageForStatus(500, body);

        assertTrue(message.endsWith(body));
    }

    @Test
    @DisplayName("messageForStatus：超长 body 截断到 200 字符以内并带省略号")
    void messageForStatus_longBodyTruncated() {
        // 第 201 个字符是可识别的哨兵，截断后不应出现
        String body = "x".repeat(200) + "哨兵不应出现" + "y".repeat(100);

        String message = AiUpstreamErrors.messageForStatus(500, body);

        assertFalse(message.contains("哨兵不应出现"), "超长 body 必须被截断：" + message);
        assertTrue(message.endsWith("..."), "截断后应有省略号：" + message);
        // 摘要在整条消息末尾，长度不超过 200
        String snippet = message.substring(message.indexOf("：") + 1);
        assertTrue(snippet.length() <= 200, "摘要长度必须 ≤ 200：" + snippet.length());
    }

    @Test
    @DisplayName("messageForStatus：body 首尾空白被裁剪")
    void messageForStatus_bodyTrimmed() {
        assertEquals("miao-ai 返回 429（额度已用完或触发限流）：quota exceeded",
                AiUpstreamErrors.messageForStatus(429, "  quota exceeded\n"));
    }
}
