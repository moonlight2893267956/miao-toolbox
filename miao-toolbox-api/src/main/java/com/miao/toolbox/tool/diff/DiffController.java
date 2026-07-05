package com.miao.toolbox.tool.diff;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/diff")
@RequireRoute("TOOL_TEXT_COMPARE")
@RequiredArgsConstructor
public class DiffController {

    private final DiffService diffService;
    private final DiffCosService diffCosService;

    /**
     * POST /api/diff — 执行文本对比
     */
    @PostMapping
    public ResponseEntity<ApiResponse<DiffResult>> compare(@Valid @RequestBody DiffRequest request) {
        List<String> fileKeys = new ArrayList<>();

        // 互斥校验：left 与 leftFileKey 不能同时提供
        if (request.getLeft() != null && !request.getLeft().isBlank()
                && request.getLeftFileKey() != null && !request.getLeftFileKey().isBlank()) {
            throw new BusinessException("DIFF_INVALID_REQUEST", "left 与 leftFileKey 不能同时提供", 400);
        }
        if (request.getRight() != null && !request.getRight().isBlank()
                && request.getRightFileKey() != null && !request.getRightFileKey().isBlank()) {
            throw new BusinessException("DIFF_INVALID_REQUEST", "right 与 rightFileKey 不能同时提供", 400);
        }

        // 如果使用 fileKey 模式，从 COS 拉取内容
        if (request.getLeftFileKey() != null && !request.getLeftFileKey().isBlank()) {
            String content = diffCosService.download(request.getLeftFileKey());
            request.setLeft(content);
            fileKeys.add(request.getLeftFileKey());
        }
        if (request.getRightFileKey() != null && !request.getRightFileKey().isBlank()) {
            String content = diffCosService.download(request.getRightFileKey());
            request.setRight(content);
            fileKeys.add(request.getRightFileKey());
        }

        DiffResult result = diffService.compare(request);
        if (!fileKeys.isEmpty()) {
            result.setFileKeys(fileKeys);
        }
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * POST /api/diff/upload — 文件上传到 COS
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<FileUploadResult>> upload(@RequestParam("file") MultipartFile file) {
        if (file.getSize() > 100 * 1024 * 1024L) {
            throw new BusinessException("DIFF_FILE_TOO_LARGE", "文件大小超过 100MB 限制", 400);
        }

        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException e) {
            throw new BusinessException("DIFF_COS_ERROR", "文件读取失败", 400);
        }
        String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";

        FileUploadResult result = diffCosService.upload(originalFilename, content);
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
