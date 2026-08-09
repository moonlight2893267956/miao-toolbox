package com.miao.toolbox.storage.controller;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.storage.dto.DirectoryTreeDTO;
import com.miao.toolbox.storage.dto.FileInfoDTO;
import com.miao.toolbox.storage.dto.PresignedUrlDTO;
import com.miao.toolbox.storage.dto.ShareDTO;
import com.miao.toolbox.storage.dto.SharedWithMeDTO;
import com.miao.toolbox.storage.dto.UploadResultDTO;
import com.miao.toolbox.storage.dto.CreateShareRequest;
import com.miao.toolbox.storage.entity.DirectoryEntity;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.service.FileService;
import com.miao.toolbox.storage.service.StorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 文件管理 API
 * <p>
 * 所有接口需要登录认证。路径前缀 /api/storage
 */
@RestController
@RequestMapping("/api/storage")
@RequiredArgsConstructor
public class FileController {

    private final FileService fileService;
    private final StorageService storageService;

    // ==================== 文件上传 ====================

    /**
     * 上传文件
     */
    @PostMapping(value = "/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<UploadResultDTO> uploadFile(
            @AuthenticationPrincipal Object principal,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "path", defaultValue = "") String path) throws IOException {
        Long userId = extractUserId(principal);
        UploadResultDTO result = fileService.uploadFile(
                userId, path, file.getOriginalFilename(),
                file.getInputStream(), file.getSize(), file.getContentType());
        return ApiResponse.success(result);
    }

    // ==================== 文件下载 ====================

    /**
     * 获取下载预签名 URL
     */
    @GetMapping("/files/{fileId}/download-url")
    public ApiResponse<PresignedUrlDTO> getDownloadUrl(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.generateDownloadUrl(userId, fileId));
    }

    /**
     * 预览文件（后端代理流式返回，确保 Content-Type 正确，浏览器内联显示）
     */
    @GetMapping("/files/{fileId}/preview")
    public ResponseEntity<InputStreamResource> previewFile(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId) {
        Long userId = extractUserId(principal);
        FileEntity file = fileService.getFileEntityForUser(userId, fileId);

        // 兜底 mimeType
        String mimeType = file.getMimeType();
        if (mimeType == null || mimeType.isBlank()) {
            mimeType = "application/octet-stream";
        }

        InputStream inputStream = storageService.getObject(file.getCosKey());

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mimeType))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename*=UTF-8''" + URLEncoder.encode(file.getFileName(), StandardCharsets.UTF_8))
                .body(new InputStreamResource(inputStream));
    }

    /**
     * 文本文件预览（返回文本内容，用于前端代码/文本预览组件）
     */
    @GetMapping("/files/{fileId}/text-preview")
    public ApiResponse<Map<String, Object>> textPreview(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId) {
        Long userId = extractUserId(principal);
        FileEntity file = fileService.getFileEntityForUser(userId, fileId);
        String content = fileService.getTextPreview(userId, fileId);
        return ApiResponse.success(Map.of(
                "fileName", file.getFileName(),
                "mimeType", file.getMimeType() != null ? file.getMimeType() : "",
                "content", content
        ));
    }

    /**
     * 更新文本文件内容（覆盖写入，需要 EDIT 权限）
     */
    @PutMapping("/files/{fileId}/content")
    public ApiResponse<FileInfoDTO> updateTextContent(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId,
            @RequestBody Map<String, String> body) {
        Long userId = extractUserId(principal);
        String content = body.get("content");
        if (content == null) {
            throw new com.miao.toolbox.common.exception.BusinessException(
                    com.miao.toolbox.common.constant.ErrorCode.VALIDATION_FAILED, "content 不能为空", 400);
        }
        return ApiResponse.success(fileService.updateTextContent(userId, fileId, content));
    }

    /**
     * 下载文件（后端代理流式返回）
     */
    @GetMapping("/files/{fileId}/download")
    public ResponseEntity<InputStreamResource> downloadFile(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId) {
        Long userId = extractUserId(principal);
        FileEntity file = fileService.getFileEntityForUser(userId, fileId);

        String mimeType = file.getMimeType();
        if (mimeType == null || mimeType.isBlank()) {
            mimeType = "application/octet-stream";
        }

        InputStream inputStream = storageService.getObject(file.getCosKey());

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mimeType))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename*=UTF-8''" + URLEncoder.encode(file.getFileName(), StandardCharsets.UTF_8))
                .body(new InputStreamResource(inputStream));
    }

    // ==================== 文件列表 ====================

    /**
     * 列出目录下的文件
     */
    @GetMapping("/files")
    public ApiResponse<PagedResponse<FileInfoDTO>> listFiles(
            @AuthenticationPrincipal Object principal,
            @RequestParam(value = "path", defaultValue = "") String path,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        Long userId = extractUserId(principal);
        var filePage = fileService.listFiles(userId, path, page, pageSize);
        PagedResponse<FileInfoDTO> response = new PagedResponse<>(
                filePage.getContent(), filePage.getTotalElements(), filePage.getNumber(), filePage.getSize());
        return ApiResponse.success(response);
    }

    /**
     * 搜索文件
     */
    @GetMapping("/files/search")
    public ApiResponse<PagedResponse<FileInfoDTO>> searchFiles(
            @AuthenticationPrincipal Object principal,
            @RequestParam("keyword") String keyword,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        Long userId = extractUserId(principal);
        var filePage = fileService.searchFiles(userId, keyword, page, pageSize);
        PagedResponse<FileInfoDTO> response = new PagedResponse<>(
                filePage.getContent(), filePage.getTotalElements(), filePage.getNumber(), filePage.getSize());
        return ApiResponse.success(response);
    }

    // ==================== 文件操作 ====================

    /**
     * 删除文件
     */
    @DeleteMapping("/files/{fileId}")
    public ApiResponse<Void> deleteFile(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId) {
        Long userId = extractUserId(principal);
        fileService.deleteFile(userId, fileId);
        return ApiResponse.success(null);
    }

    /**
     * 重命名文件
     */
    @PutMapping("/files/{fileId}/rename")
    public ApiResponse<FileInfoDTO> renameFile(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId,
            @RequestBody Map<String, String> body) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.renameFile(userId, fileId, body.get("newName")));
    }

    /**
     * 移动文件
     */
    @PutMapping("/files/{fileId}/move")
    public ApiResponse<FileInfoDTO> moveFile(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId,
            @RequestBody Map<String, String> body) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.moveFile(userId, fileId, body.get("newPath")));
    }

    // ==================== 目录管理 ====================

    /**
     * 创建目录
     */
    @PostMapping("/directories")
    public ApiResponse<DirectoryEntity> createDirectory(
            @AuthenticationPrincipal Object principal,
            @RequestBody Map<String, String> body) {
        Long userId = extractUserId(principal);
        DirectoryEntity dir = fileService.createDirectory(
                userId, body.get("name"), body.get("parentPath"));
        return ApiResponse.success(dir);
    }

    /**
     * 列出子目录
     */
    @GetMapping("/directories")
    public ApiResponse<List<DirectoryEntity>> listDirectories(
            @AuthenticationPrincipal Object principal,
            @RequestParam(value = "parentPath", defaultValue = "") String parentPath) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.listDirectories(userId, parentPath));
    }

    /**
     * 获取完整目录树（用于左侧目录树展示）
     */
    @GetMapping("/directory-tree")
    public ApiResponse<List<DirectoryTreeDTO>> getDirectoryTree(
            @AuthenticationPrincipal Object principal) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.getDirectoryTree(userId));
    }

    /**
     * 删除目录
     */
    @DeleteMapping("/directories/{dirId}")
    public ApiResponse<Void> deleteDirectory(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long dirId) {
        Long userId = extractUserId(principal);
        fileService.deleteDirectory(userId, dirId);
        return ApiResponse.success(null);
    }

    // ==================== 配额 ====================

    /**
     * 获取存储配额信息
     */
    @GetMapping("/quota")
    public ApiResponse<FileService.QuotaInfoDTO> getQuotaInfo(
            @AuthenticationPrincipal Object principal) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.getQuotaInfo(userId));
    }

    // ==================== 共享管理 ====================

    /**
     * 共享文件给指定用户
     */
    @PostMapping("/files/{fileId}/shares")
    public ApiResponse<ShareDTO> shareFile(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId,
            @RequestBody CreateShareRequest request) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.shareFile(userId, fileId, request.getUserId(), request.getPermission()));
    }

    /**
     * 查看文件的共享列表
     */
    @GetMapping("/files/{fileId}/shares")
    public ApiResponse<List<ShareDTO>> listFileShares(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.listFileShares(userId, fileId));
    }

    /**
     * 取消共享
     */
    @DeleteMapping("/files/{fileId}/shares/{shareId}")
    public ApiResponse<Void> unshareFile(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId,
            @PathVariable Long shareId) {
        Long userId = extractUserId(principal);
        fileService.unshareFile(userId, fileId, shareId);
        return ApiResponse.success(null);
    }

    /**
     * 更新共享记录的权限（可编辑 / 可查看）
     */
    @PutMapping("/files/{fileId}/shares/{shareId}")
    public ApiResponse<ShareDTO> updateSharePermission(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId,
            @PathVariable Long shareId,
            @RequestBody Map<String, String> body) {
        Long userId = extractUserId(principal);
        String permission = body.get("permission");
        if (permission == null || permission.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "权限参数不能为空", 400);
        }
        return ApiResponse.success(fileService.updateSharePermission(userId, fileId, shareId, permission));
    }

    /**
     * 查看共享给我的文件
     */
    @GetMapping("/files/shared-with-me")
    public ApiResponse<List<SharedWithMeDTO>> listSharedWithMe(
            @AuthenticationPrincipal Object principal) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.listSharedWithMe(userId));
    }

    /**
     * 将共享给我的文件复制到我的文件（可指定目标目录，默认根目录）
     */
    @PostMapping("/files/{fileId}/copy-to-mine")
    public ApiResponse<FileInfoDTO> copySharedFileToMine(
            @AuthenticationPrincipal Object principal,
            @PathVariable Long fileId,
            @RequestParam(value = "path", defaultValue = "") String path) {
        Long userId = extractUserId(principal);
        return ApiResponse.success(fileService.copySharedFileToMine(userId, fileId, path));
    }

    // ==================== 工具方法 ====================

    private Long extractUserId(Object principal) {
        if (principal instanceof com.miao.toolbox.auth.entity.User user) {
            return user.getId();
        }
        return null;
    }
}
