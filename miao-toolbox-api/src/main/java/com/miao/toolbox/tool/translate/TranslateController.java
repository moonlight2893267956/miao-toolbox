package com.miao.toolbox.tool.translate;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.tool.translate.dto.DetectRequest;
import com.miao.toolbox.tool.translate.dto.DetectResponse;
import com.miao.toolbox.tool.translate.dto.ImageTranslateResponse;
import com.miao.toolbox.tool.translate.dto.TranslateRequest;
import com.miao.toolbox.tool.translate.dto.TranslateResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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

    /**
     * POST /api/translate/image — 图片翻译（FR-8）
     *
     * <p>以 multipart/form-data 上传图片，{@code from} 可选（默认 {@code auto}），
     * {@code to} 必填。响应含 OCR 文本块、逐块译文、整图全文与译文渲染图。
     */
    @PostMapping(value = "/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ImageTranslateResponse>> imageTranslate(
            @RequestPart("image") MultipartFile image,
            @RequestParam(value = "from", defaultValue = "auto") String from,
            @RequestParam("to") String to) {
        return ResponseEntity.ok(ApiResponse.success(translateService.imageTranslate(image, from, to)));
    }
}
