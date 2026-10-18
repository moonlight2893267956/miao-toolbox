package com.miao.toolbox.tool.regex;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.observability.AiStreamProxy;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.miao.toolbox.tool.regex.dto.RegexAIRequest;
import com.miao.toolbox.tool.regex.dto.RegexAIResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;


/**
 * 正则 AI Controller — 提供自然语言生成正则、正则解释、优化建议、匹配诊断、方言转换五个能力。
 *
 * <p>统一端点：
 * <ul>
 *   <li>POST /api/regex/ai — 同步调用，返回完整结果</li>
 *   <li>POST /api/regex/ai/stream — SSE 流式调用，逐 token 输出</li>
 * </ul>
 * 两者均通过 MiaoAiClient 转发到 regex-assistant Agent。
 */
@Slf4j
@RestController
@RequestMapping("/api/regex/ai")
@RequireRoute("TOOL_REGEX_TESTER")
@RequiredArgsConstructor
public class RegexAIController {

    private static final String AGENT_KEY = "regex-assistant";

    private final RegexAIService regexAIService;
    private final MiaoAiClient miaoAiClient;
    private final MiaoAiProperties miaoAiProperties;
    private final ObjectMapper objectMapper;
    /** 流式转发唯一实现：连接、解析、失败归因、记账幂等都在它那里 */
    private final AiStreamProxy aiStreamProxy;

    @PostMapping
    public ResponseEntity<ApiResponse<RegexAIResponse>> aiInvoke(
            @Valid @RequestBody RegexAIRequest request) {

        validateRequest(request);

        RegexAIResponse response = regexAIService.invoke(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * POST /api/regex/ai/stream —— SSE 流式调用 regex-assistant。
     *
     * <p>此前自带线程池、记账、超时回调与 fail-fast，与另三个 AI 工具逐行重复。
     * 现全部委托 {@link AiStreamProxy}，此处只保留 HTTP 端点职责。
     *
     * <p>收敛后顺带修掉：上游断流曾被记成「用户自己断开」（归因反了），
     * 缺 {@code done} 的半截流曾被当成成功。
     */
    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody RegexAIRequest request) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
        if (!agent.isEnabled()) {
            return aiStreamProxy.failFast("AI_AGENT_DISABLED", "正则 AI 助手未启用", 503);
        }

        validateRequest(request);

        return regexAIService.stream(request);
    }

    private void validateRequest(RegexAIRequest request) {
        String task = request.getTask();
        if ("generate".equals(task)) {
            if (request.getDescription() == null || request.getDescription().isBlank()) {
                throw new BusinessException("INVALID_REQUEST", "generate 任务需要提供 description", 400);
            }
            return;
        }

        // explain / optimize / diagnose / convert 都需要 pattern
        if (request.getPattern() == null || request.getPattern().isBlank()) {
            throw new BusinessException("INVALID_REQUEST",
                    task + " 任务需要提供 pattern", 400);
        }

        if ("diagnose".equals(task)) {
            if (request.getSamples() == null || request.getSamples().isEmpty()) {
                throw new BusinessException("INVALID_REQUEST",
                        "diagnose 任务需要提供 samples（样例文本）", 400);
            }
        } else if ("convert".equals(task)) {
            if (request.getTargetEngine() == null || request.getTargetEngine().isBlank()) {
                throw new BusinessException("INVALID_REQUEST",
                        "convert 任务需要提供 targetEngine", 400);
            }
        }
    }

    private String safeToJson(Object obj) {
        try {
            return truncate(objectMapper.writeValueAsString(obj), 512);
        } catch (Exception e) {
            return truncate(String.valueOf(obj), 512);
        }
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return null;
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }
}
