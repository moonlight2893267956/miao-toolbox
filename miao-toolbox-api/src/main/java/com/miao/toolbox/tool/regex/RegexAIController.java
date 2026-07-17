package com.miao.toolbox.tool.regex;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.miao.toolbox.tool.regex.dto.RegexAIRequest;
import com.miao.toolbox.tool.regex.dto.RegexAIResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 正则 AI Controller — 提供自然语言生成正则、正则解释、优化建议三个能力。
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
    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();

    @PostMapping
    public ResponseEntity<ApiResponse<RegexAIResponse>> aiInvoke(
            @Valid @RequestBody RegexAIRequest request) {

        validateRequest(request);

        RegexAIResponse response = regexAIService.invoke(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody RegexAIRequest request) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
        if (!agent.isEnabled()) {
            SseEmitter emitter = new SseEmitter(0L);
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"正则 AI 助手未启用\"}"));
                emitter.complete();
            } catch (Exception ignored) {
            }
            return emitter;
        }

        validateRequest(request);

        SecurityContext securityContext = SecurityContextHolder.getContext();
        SseEmitter emitter = new SseEmitter(180_000L);

        String requestSummary = safeToJson(request);
        String effectiveAgentName = miaoAiProperties.getEffectiveAgentName(AGENT_KEY);
        AiInvocationRecorder.InvocationHandle handle =
                miaoAiClient.recordStreamStart(effectiveAgentName, requestSummary);

        sseExecutor.execute(() -> {
            SecurityContextHolder.setContext(securityContext);
            try {
                regexAIService.stream(request, emitter, handle);
            } finally {
                SecurityContextHolder.clearContext();
            }
        });

        emitter.onTimeout(() -> {
            log.warn("SSE emitter timeout for regex stream");
            miaoAiClient.recordStreamFailure(handle, "SSE_TIMEOUT", "SSE 连接超时");
        });
        emitter.onError(ex -> {
            log.warn("SSE emitter error: {}", ex.getMessage());
            miaoAiClient.recordStreamFailure(handle, "SSE_ERROR", ex.getMessage());
        });

        return emitter;
    }

    private void validateRequest(RegexAIRequest request) {
        if ("generate".equals(request.getTask())) {
            if (request.getDescription() == null || request.getDescription().isBlank()) {
                throw new BusinessException("INVALID_REQUEST", "generate 任务需要提供 description", 400);
            }
        } else {
            if (request.getPattern() == null || request.getPattern().isBlank()) {
                throw new BusinessException("INVALID_REQUEST",
                        request.getTask() + " 任务需要提供 pattern", 400);
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
