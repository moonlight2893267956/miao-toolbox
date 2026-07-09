package com.miao.toolbox.tool.translate;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.tool.translate.dto.DetectRequest;
import com.miao.toolbox.tool.translate.dto.DetectResponse;
import com.miao.toolbox.tool.translate.dto.TranslateRequest;
import com.miao.toolbox.tool.translate.dto.TranslateResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 翻译工具后端入口。
 *
 * <p>所有端点均需 {@code TOOL_TRANSLATE} 路由权限（@RequireRoute 拦截器校验）。
 * 实际调用经由 {@link TranslateService} → {@link com.miao.toolbox.proxy.client.BaiduTranslateClient} 代理百度 API。
 */
@Slf4j
@RestController
@RequestMapping("/api/translate")
@RequireRoute("TOOL_TRANSLATE")
@RequiredArgsConstructor
public class TranslateController {

    private final TranslateService translateService;

    /**
     * POST /api/translate — 文本翻译（FR-1/2/3/4）
     */
    @PostMapping
    public ResponseEntity<ApiResponse<TranslateResponse>> translate(
            @Valid @RequestBody TranslateRequest request) {
        return ResponseEntity.ok(ApiResponse.success(translateService.translate(request)));
    }

    /**
     * POST /api/translate/detect — 语种识别（FR-5/6/7）
     */
    @PostMapping("/detect")
    public ResponseEntity<ApiResponse<DetectResponse>> detect(
            @Valid @RequestBody DetectRequest request) {
        return ResponseEntity.ok(ApiResponse.success(translateService.detect(request)));
    }
}
