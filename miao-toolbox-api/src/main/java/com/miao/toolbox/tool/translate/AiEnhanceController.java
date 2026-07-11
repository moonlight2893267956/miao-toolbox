package com.miao.toolbox.tool.translate;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.tool.translate.dto.AiEnhanceRequest;
import com.miao.toolbox.tool.translate.dto.AiEnhanceResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 增强翻译入口（FR-16/FR-17，story-4.1）。
 *
 * <p>复用 {@code TOOL_TRANSLATE} 路由权限（AI 增强是翻译工具子能力）。
 * 调用经 {@link AiEnhanceService} → {@link MiaoAiClient} 转发至 miao-ai translate-agent。
 */
@Slf4j
@RestController
@RequestMapping("/api/translate")
@RequireRoute("TOOL_TRANSLATE")
@RequiredArgsConstructor
public class AiEnhanceController {

    private final AiEnhanceService aiEnhanceService;

    /**
     * POST /api/translate/enhance — AI 润色/风格化/上下文连贯
     */
    @PostMapping("/enhance")
    public ResponseEntity<ApiResponse<AiEnhanceResponse>> enhance(
            @Valid @RequestBody AiEnhanceRequest request) {
        return ResponseEntity.ok(ApiResponse.success(aiEnhanceService.enhance(request)));
    }
}
