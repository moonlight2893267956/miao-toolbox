package com.miao.toolbox.tool.wubi;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.exception.GlobalExceptionHandler;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@link WubiAiController} 路由与响应格式测试（standalone MockMvc，与仓库既有控制器测试同范式）。
 *
 * <p>Controller 只做转发，因此这里挂上**真实的 {@link WubiAiService}**（仅 mock 掉
 * {@link MiaoAiClient}）：这样 400 校验、200 响应壳、上游错误码 → HTTP 状态码的整条链路
 * 都是真行为，而不是 mock 出来的假象。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("WubiAiController 路由与错误码契约测试")
class WubiAiControllerTest {

    private static final String AGENT_KEY = "wubi-explainer";

    @Mock
    private MiaoAiClient miaoAiClient;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        WubiAiController controller = new WubiAiController(new WubiAiService(miaoAiClient));
        mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private String explainBody() {
        return """
                {"char":"好","code":"vbg","positions":[{"index":1,"key":"v"}]}
                """;
    }

    // ── 成功路径 ────────────────────────────────────────────

    @Test
    @DisplayName("POST /explain：200 且响应壳为 {code:SUCCESS, data:{...}}")
    void explain_success() throws Exception {
        when(miaoAiClient.invoke(eq(AGENT_KEY), any(), any())).thenReturn(
                MiaoAiInvokeResponse.builder()
                        .output(Map.of("explanation", "先打 v", "suggestions", java.util.List.of("口诀")))
                        .conversationId("conv-1")
                        .turn(1)
                        .build());

        mvc.perform(post("/api/wubi/ai/explain")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(explainBody()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.explanation").value("先打 v"))
                .andExpect(jsonPath("$.data.suggestions[0]").value("口诀"))
                .andExpect(jsonPath("$.data.conversationId").value("conv-1"))
                .andExpect(jsonPath("$.data.turn").value(1));
    }

    @Test
    @DisplayName("POST /followup：200 且响应壳为 {code:SUCCESS, data:{...}}")
    void followup_success() throws Exception {
        when(miaoAiClient.invoke(eq(AGENT_KEY), any(), any())).thenReturn(
                MiaoAiInvokeResponse.builder()
                        .output(Map.of("explanation", "因为 v 是女字旁"))
                        .conversationId("conv-1")
                        .turn(3)
                        .historyTruncated(true)
                        .build());

        mvc.perform(post("/api/wubi/ai/followup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"char":"好","question":"为什么第一位是 v？","conversationId":"conv-1"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.explanation").value("因为 v 是女字旁"))
                .andExpect(jsonPath("$.data.turn").value(3))
                .andExpect(jsonPath("$.data.historyTruncated").value(true));
    }

    // ── 请求体校验：400 ─────────────────────────────────────

    @Test
    @DisplayName("POST /explain：缺 char / code / positions → 400 + VALIDATION_FAILED")
    void explain_missingFields_returns400() throws Exception {
        mvc.perform(post("/api/wubi/ai/explain")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"vbg\",\"positions\":[{\"index\":1}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("char 不能为空"));

        mvc.perform(post("/api/wubi/ai/explain")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"char\":\"好\",\"positions\":[{\"index\":1}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("code 不能为空"));

        mvc.perform(post("/api/wubi/ai/explain")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"char\":\"好\",\"code\":\"vbg\",\"positions\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("positions 不能为空"));
    }

    @Test
    @DisplayName("POST /followup：缺 conversationId → 400 + VALIDATION_FAILED")
    void followup_missingConversationId_returns400() throws Exception {
        mvc.perform(post("/api/wubi/ai/followup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"char\":\"好\",\"question\":\"为什么？\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("conversationId 不能为空"));
    }

    // ── 上游错误码映射：状态码 + code 字段 ──────────────────

    @Test
    @DisplayName("上游 410 → HTTP 410 + AI_CONVERSATION_EXPIRED")
    void upstream410_returns410() throws Exception {
        when(miaoAiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenThrow(new BusinessException("AI_UPSTREAM_410", "miao-ai 返回 410（会话已过期）", 502));

        mvc.perform(post("/api/wubi/ai/followup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"char\":\"好\",\"question\":\"为什么？\",\"conversationId\":\"conv-1\"}"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("AI_CONVERSATION_EXPIRED"))
                .andExpect(jsonPath("$.message").value("AI 会话已失效，请重新开始讲解"));
    }

    @Test
    @DisplayName("上游 409 → HTTP 409 + AI_CONVERSATION_BUSY")
    void upstream409_returns409() throws Exception {
        when(miaoAiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenThrow(new BusinessException("AI_UPSTREAM_409", "miao-ai 返回 409（上一轮还在处理中）", 502));

        mvc.perform(post("/api/wubi/ai/followup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"char\":\"好\",\"question\":\"为什么？\",\"conversationId\":\"conv-1\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AI_CONVERSATION_BUSY"));
    }

    @Test
    @DisplayName("上游 429 → HTTP 429 + AI_QUOTA_EXCEEDED")
    void upstream429_returns429() throws Exception {
        when(miaoAiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenThrow(new BusinessException("AI_UPSTREAM_429", "miao-ai 返回 429（额度已用完）", 502));

        mvc.perform(post("/api/wubi/ai/explain")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(explainBody()))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("AI_QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.message").value("AI 额度已用完"));
    }

    @Test
    @DisplayName("上游 5xx → HTTP 503 + AI_SERVICE_UNAVAILABLE")
    void upstream5xx_returns503() throws Exception {
        when(miaoAiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenThrow(new BusinessException("AI_UPSTREAM_5XX", "miao-ai 返回 503（服务端异常）", 502));

        mvc.perform(post("/api/wubi/ai/explain")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(explainBody()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AI_SERVICE_UNAVAILABLE"));
    }

    @Test
    @DisplayName("agent 输出结构异常 → HTTP 502 + AI_RESPONSE_INVALID")
    void invalidOutput_returns502() throws Exception {
        when(miaoAiClient.invoke(eq(AGENT_KEY), any(), any())).thenReturn(
                MiaoAiInvokeResponse.builder().output("纯文本回答").build());

        mvc.perform(post("/api/wubi/ai/explain")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(explainBody()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("AI_RESPONSE_INVALID"))
                .andExpect(jsonPath("$.message").value("AI 返回结构异常"));
    }
}
