package com.miao.toolbox.tool.cron;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.miao.toolbox.tool.cron.dto.CronAIRequest;
import com.miao.toolbox.tool.cron.dto.CronAIResponse;
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
 * Cron AI Controller — 提供自然语言生成 Cron、详解、优化、排错、方言转换五个能力。
 *
 * <p>统一端点：
 * <ul>
 *   <li>POST /api/cron/ai — 同步调用，返回完整结果</li>
 *   <li>POST /api/cron/ai/stream — SSE 流式调用，逐 token 输出（前端主用）</li>
 * </ul>
 * 两者均通过 MiaoAiClient 转发到 cron-assistant Agent，并受 {@code TOOL_CRON_EDITOR} 路由权限保护。
 */
@Slf4j
@RestController
@RequestMapping("/api/cron/ai")
@RequireRoute("TOOL_CRON_EDITOR")
@RequiredArgsConstructor
public class CronAIController {

    private static final String AGENT_KEY = "cron-assistant";

    private final CronAIService cronAIService;
    private final MiaoAiClient miaoAiClient;
    private final MiaoAiProperties miaoAiProperties;
    private final ObjectMapper objectMapper;
    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();

    @PostMapping
    public ResponseEntity<ApiResponse<CronAIResponse>> aiInvoke(
            @Valid @RequestBody CronAIRequest request) {

        validateRequest(request);

        CronAIResponse response = cronAIService.invoke(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody CronAIRequest request) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
        if (!agent.isEnabled()) {
            SseEmitter emitter = new SseEmitter(0L);
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"Cron AI 助手未启用\"}"));
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
                cronAIService.stream(request, emitter, handle);
            } finally {
                SecurityContextHolder.clearContext();
            }
        });

        emitter.onTimeout(() -> {
            log.warn("SSE emitter timeout for cron stream");
            miaoAiClient.recordStreamFailure(handle, "SSE_TIMEOUT", "SSE 连接超时");
        });
        emitter.onError(ex -> {
            log.warn("SSE emitter error: {}", ex.getMessage());
            miaoAiClient.recordStreamFailure(handle, "SSE_ERROR", ex.getMessage());
        });

        return emitter;
    }

    private void validateRequest(CronAIRequest request) {
        switch (request.getTask()) {
            case "generate" -> {
                if (request.getDescription() == null || request.getDescription().isBlank()) {
                    throw new BusinessException("INVALID_REQUEST", "generate 任务需要提供 description", 400);
                }
            }
            case "explain", "optimize" -> {
                if (request.getExpression() == null || request.getExpression().isBlank()) {
                    throw new BusinessException("INVALID_REQUEST",
                            request.getTask() + " 任务需要提供 expression", 400);
                }
            }
            case "diagnose" -> {
                if (request.getExpression() == null || request.getExpression().isBlank()) {
                    throw new BusinessException("INVALID_REQUEST", "diagnose 任务需要提供 expression", 400);
                }
                if (request.getPhenomenon() == null || request.getPhenomenon().isBlank()) {
                    throw new BusinessException("INVALID_REQUEST", "diagnose 任务需要提供 phenomenon", 400);
                }
            }
            case "convert" -> {
                if (request.getExpression() == null || request.getExpression().isBlank()) {
                    throw new BusinessException("INVALID_REQUEST", "convert 任务需要提供 expression", 400);
                }
                if (request.getTargetDialect() == null || request.getTargetDialect().isBlank()) {
                    throw new BusinessException("INVALID_REQUEST", "convert 任务需要提供 targetDialect", 400);
                }
            }
            default -> throw new BusinessException("INVALID_REQUEST",
                    "不支持的任务类型: " + request.getTask(), 400);
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
