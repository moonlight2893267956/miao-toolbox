package com.miao.toolbox.tool.regex;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.tool.regex.dto.RegexAIRequest;
import com.miao.toolbox.tool.regex.dto.RegexAIResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 正则 AI Controller — 提供自然语言生成正则、正则解释、优化建议三个能力。
 *
 * <p>统一端点：POST /api/regex/ai，通过 task 参数区分任务类型。
 * 所有请求通过 MiaoAiClient 转发到 regex-assistant Agent。
 */
@Slf4j
@RestController
@RequestMapping("/api/regex/ai")
@RequireRoute("TOOL_REGEX_TESTER")
@RequiredArgsConstructor
public class RegexAIController {

    private final RegexAIService regexAIService;

    @PostMapping
    public ResponseEntity<ApiResponse<RegexAIResponse>> aiInvoke(
            @Valid @RequestBody RegexAIRequest request) {

        // 参数校验：generate 需要 description，explain/optimize 需要 pattern
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

        RegexAIResponse response = regexAIService.invoke(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
