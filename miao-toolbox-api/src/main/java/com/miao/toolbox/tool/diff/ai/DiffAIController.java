package com.miao.toolbox.tool.diff.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.AiStreamProxy;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

/**
 * AI 差异分析 Controller — 提供全局摘要和选中解释两个端点。
 */
@Slf4j
@RestController
@RequestMapping("/api/diff/ai")
@RequireRoute("TOOL_TEXT_COMPARE")
@RequiredArgsConstructor
public class DiffAIController {

    private static final String AGENT_KEY = "diff-explainer";

    private final AIAnalysisService aiAnalysisService;
    private final MiaoAiProperties miaoAiProperties;
    private final MiaoAiClient miaoAiClient;
    /** 流式转发唯一实现：连接建立、事件解析、失败归因、记账幂等都在它那里 */
    private final AiStreamProxy aiStreamProxy;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * POST /api/diff/ai/summary —— SSE 流式全局摘要。
     *
     * <p>此前本方法自带线程池、记账、超时回调与 fail-fast，与另三个 AI 工具
     * 逐行重复。现全部委托 {@link AiStreamProxy}（全仓库唯一实现），
     * 这里只保留 HTTP 端点职责与 diff 特有的记账（它记 token 用量）。
     *
     * <p>收敛后顺带修掉两处原有缺陷：上游断流曾被记成「用户自己断开」（归因反了），
     * 缺 {@code done} 的半截流曾被当成成功。
     */
    @PostMapping(value = "/summary", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter summary(@RequestBody AIAnalysisRequest request) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
        if (!agent.isEnabled()) {
            // agent 未启用：立刻回错误事件并结束，不让浏览器对着一个空流干等
            return aiStreamProxy.failFast("AI_AGENT_DISABLED", "AI 分析功能未启用", 503);
        }

        request.setMode("summary");

        return aiStreamProxy.proxy(
                AiStreamProxy.Request.of(AGENT_KEY,
                                aiAnalysisService.buildInput(request), Map.of(), "diff-summary")
                        // 保留原 180s，不动既有行为
                        .withTimeout(180_000L),
                new AiStreamProxy.Observer() {
                    @Override
                    public void recordSuccess(AiStreamProxy.StreamStats stats,
                                              AiInvocationRecorder.InvocationHandle handle) {
                        recordDoneEvent(handle, stats.doneData());
                    }
                });
    }

    @PostMapping("/explain")
    public ResponseEntity<ApiResponse<AIAnalysisResponse>> explain(@RequestBody AIAnalysisRequest request) {
        request.setMode("explain_selection");
        AIAnalysisResponse response = aiAnalysisService.analyze(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }


    private void recordDoneEvent(AiInvocationRecorder.InvocationHandle handle, String dataJson) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> doneData = objectMapper.readValue(dataJson, Map.class);

            String model = (String) doneData.get("model");
            String mode = (String) doneData.get("mode");
            String traceId = (String) doneData.get("trace_id");

            Integer promptTokens = null;
            Integer completionTokens = null;
            Integer totalTokens = null;
            @SuppressWarnings("unchecked")
            Map<String, Object> usage = (Map<String, Object>) doneData.get("usage");
            if (usage != null) {
                promptTokens = usage.get("prompt_tokens") instanceof Number n ? n.intValue() : null;
                completionTokens = usage.get("completion_tokens") instanceof Number n ? n.intValue() : null;
                totalTokens = usage.get("total_tokens") instanceof Number n ? n.intValue() : null;
            }

            miaoAiClient.recordStreamSuccess(handle, model, mode, traceId,
                    promptTokens, completionTokens, totalTokens,
                    truncate(String.valueOf(doneData.get("analysis")), 512));

        } catch (Exception e) {
            log.warn("Failed to parse SSE done event for recording: {}", e.getMessage());
            miaoAiClient.recordStreamSuccess(handle, null, null, null,
                    null, null, null, "done_event_parse_failed");
        }
    }


    private String truncate(String text, int maxLength) {
        if (text == null) return null;
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }

    private String safeToJson(Object obj) {
        try {
            return truncate(objectMapper.writeValueAsString(obj), 512);
        } catch (Exception e) {
            return truncate(String.valueOf(obj), 512);
        }
    }
}
