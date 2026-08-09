package com.miao.toolbox.storage.exception;

import lombok.Getter;

/**
 * 文件存储服务异常
 */
@Getter
public class StorageException extends RuntimeException {

    private final String code;
    private final int status;

    public StorageException(String code, String message, int status) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public StorageException(String code, String message, int status, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.status = status;
    }

    public static StorageException cosNotConfigured() {
        return new StorageException("STORAGE_COS_ERROR", "COS 服务未配置", 500);
    }

    public static StorageException uploadFailed(String reason) {
        return new StorageException("UPLOAD_FAILED", "文件上传失败: " + reason, 500);
    }

    public static StorageException uploadFailed(String reason, Throwable cause) {
        return new StorageException("UPLOAD_FAILED", "文件上传失败: " + reason, 500, cause);
    }

    public static StorageException downloadFailed(String reason) {
        return new StorageException("DOWNLOAD_FAILED", "文件下载失败: " + reason, 500);
    }

    public static StorageException fileNotFound() {
        return new StorageException("FILE_NOT_FOUND", "文件不存在", 404);
    }

    public static StorageException deleteFailed(String reason) {
        return new StorageException("DELETE_FAILED", "文件删除失败: " + reason, 500);
    }

    public static StorageException copyFailed(String reason) {
        return new StorageException("COPY_FAILED", "文件复制失败: " + reason, 500);
    }

    public static StorageException listFailed(String reason) {
        return new StorageException("LIST_FAILED", "文件列表获取失败: " + reason, 500);
    }

    public static StorageException urlGenerationFailed(String reason) {
        return new StorageException("URL_GENERATION_FAILED", "预签名 URL 生成失败: " + reason, 500);
    }

    public static StorageException fileNameInvalid(String reason) {
        return new StorageException("FILE_NAME_INVALID", "文件名不合法: " + reason, 400);
    }

    public static StorageException quotaExceeded() {
        return new StorageException("QUOTA_EXCEEDED", "超出存储配额", 400);
    }

    public static StorageException permissionDenied() {
        return new StorageException("PERMISSION_DENIED", "无文件操作权限", 403);
    }

    public static StorageException previewNotSupported(String reason) {
        return new StorageException("PREVIEW_NOT_SUPPORTED", reason, 400);
    }

    public static StorageException previewFailed(String reason) {
        return new StorageException("PREVIEW_FAILED", "文件预览失败: " + reason, 500);
    }
}
