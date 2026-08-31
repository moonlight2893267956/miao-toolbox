package com.miao.toolbox.storage.controller;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.storage.dto.ShareInfoDTO;
import com.miao.toolbox.storage.dto.UnlockShareRequest;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.exception.StorageException;
import com.miao.toolbox.storage.service.FileService;
import com.miao.toolbox.storage.service.FileShareLinkService;
import com.miao.toolbox.storage.service.StorageService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 外链分享访客 API（免登）
 * <p>
 * 路径前缀 /api/public/share，已在 SecurityConfig 与 AntiReplayFilter 两处放行。
 * <p>
 * 安全约束：所有业务失败响应一律为 403/404，<b>绝不返回 401</b>。
 * 前端 axiosInstance 的 401 拦截器会触发静默刷新，失败后把页面跳转到 /login，
 * 若此处返回 401 会导致访客被莫名弹到登录页。
 */
@RestController
@RequestMapping("/api/public/share")
@RequiredArgsConstructor
public class PublicShareController {

    private final FileShareLinkService fileShareLinkService;
    private final StorageService storageService;
    private final FileService fileService;

    /**
     * 获取分享公开信息（不含提取码）
     */
    @GetMapping("/{code}/info")
    public ApiResponse<ShareInfoDTO> getShareInfo(@PathVariable("code") String code) {
        return ApiResponse.success(fileShareLinkService.getShareInfo(code));
    }

    /**
     * 校验提取码并换取短期访问票据
     */
    @PostMapping("/{code}/unlock")
    public ApiResponse<Map<String, String>> unlockShare(
            @PathVariable("code") String code,
            @RequestBody(required = false) UnlockShareRequest request,
            HttpServletRequest httpRequest) {
        String accessCode = request != null ? request.getAccessCode() : null;
        String ticket = fileShareLinkService.unlockShare(code, accessCode, resolveClientIp(httpRequest));
        return ApiResponse.success(Map.of("ticket", ticket));
    }

    /**
     * 二进制文件预览（后端代理流式返回，Content-Disposition: inline）
     */
    @GetMapping("/{code}/preview")
    public ResponseEntity<InputStreamResource> previewFile(
            @PathVariable("code") String code,
            @RequestParam(value = "st", required = false) String ticket) {
        FileEntity file = fileShareLinkService.resolveShareAccess(code, ticket).getFile();
        String mimeType = resolveMimeType(file);
        InputStream inputStream = storageService.getObject(file.getCosKey());

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mimeType))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename*=UTF-8''" + URLEncoder.encode(file.getFileName(), StandardCharsets.UTF_8))
                .body(new InputStreamResource(inputStream));
    }

    /**
     * 文本文件预览（返回文本内容）
     */
    @GetMapping("/{code}/text-preview")
    public ApiResponse<Map<String, Object>> textPreview(
            @PathVariable("code") String code,
            @RequestParam(value = "st", required = false) String ticket) {
        FileEntity file = fileShareLinkService.resolveShareAccess(code, ticket).getFile();

        String content;
        try {
            content = fileService.getTextPreview(file);
        } catch (StorageException e) {
            // 非文本类型或读取失败：转成 400 业务错误，避免访客侧出现 500
            throw new BusinessException("PREVIEW_NOT_SUPPORTED", e.getMessage(), 400);
        }

        return ApiResponse.success(Map.of(
                "fileName", file.getFileName(),
                "mimeType", file.getMimeType() != null ? file.getMimeType() : "",
                "content", content
        ));
    }

    /**
     * 下载文件（后端代理流式返回，Content-Disposition: attachment）
     */
    @GetMapping("/{code}/download")
    public ResponseEntity<InputStreamResource> downloadFile(
            @PathVariable("code") String code,
            @RequestParam(value = "st", required = false) String ticket) {
        FileEntity file = fileShareLinkService.resolveShareAccess(code, ticket).getFile();
        String mimeType = resolveMimeType(file);
        InputStream inputStream = storageService.getObject(file.getCosKey());

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mimeType))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename*=UTF-8''" + URLEncoder.encode(file.getFileName(), StandardCharsets.UTF_8))
                .body(new InputStreamResource(inputStream));
    }

    private String resolveMimeType(FileEntity file) {
        String mimeType = file.getMimeType();
        if (mimeType == null || mimeType.isBlank()) {
            return "application/octet-stream";
        }
        return mimeType;
    }

    /**
     * 解析访客 IP，优先取反向代理传递的 X-Forwarded-For 首段（与 RateLimitFilter 保持一致）
     */
    private String resolveClientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
