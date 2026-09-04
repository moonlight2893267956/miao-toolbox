package com.miao.toolbox.storage.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.notification.service.NotificationService;
import com.miao.toolbox.storage.config.StorageProperties;
import com.miao.toolbox.storage.dto.DirectoryTreeDTO;
import com.miao.toolbox.storage.dto.FileInfoDTO;
import com.miao.toolbox.storage.dto.PresignedUrlDTO;
import com.miao.toolbox.storage.dto.ShareDTO;
import com.miao.toolbox.storage.dto.SharedWithMeDTO;
import com.miao.toolbox.storage.dto.UploadResultDTO;
import com.miao.toolbox.storage.entity.DirectoryEntity;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.entity.FileShareEntity;
import com.miao.toolbox.storage.exception.StorageException;
import com.miao.toolbox.storage.model.CosObjectResult;
import com.miao.toolbox.storage.repository.DirectoryRepository;
import com.miao.toolbox.storage.repository.FileRepository;
import com.miao.toolbox.storage.repository.FileShareLinkRepository;
import com.miao.toolbox.storage.repository.FileShareRepository;
import com.miao.toolbox.storage.validator.FileNameValidator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.LongStream;

/**
 * 文件管理核心业务层
 * <p>
 * 所有文件操作通过此 Service 执行，不直接使用 StorageService 的 COS API。
 * 负责配额校验、目录校验、元数据持久化、配额增量更新。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileService {

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 默认排序字段：修改时间（Story 5.5） */
    private static final String DEFAULT_SORT_FIELD = "updatedAt";

    /** 外部排序字段 → 实体属性名（Story 5.5；custom = 自定义拖拽顺序） */
    private static final Map<String, String> SORT_FIELD_MAP = Map.of(
            "name", "fileName",
            "size", "sizeBytes",
            "updatedAt", "updatedAt",
            "type", "mimeType",
            "custom", "customOrder"
    );

    private final FileRepository fileRepository;
    private final DirectoryRepository directoryRepository;
    private final FileShareRepository fileShareRepository;
    private final FileShareLinkRepository fileShareLinkRepository;
    private final UserRepository userRepository;
    private final StorageService storageService;
    private final StorageProperties storageProperties;
    private final FileNameValidator fileNameValidator;
    private final NotificationService notificationService;

    // ==================== 上传 ====================

    /**
     * 上传文件
     *
     * @param userId      用户 ID
     * @param path        目标目录路径（空字符串表示根目录）
     * @param fileName    文件名
     * @param inputStream 文件输入流
     * @param contentLength 文件大小
     * @param mimeType    MIME 类型
     * @return 上传结果
     */
    @Transactional
    public UploadResultDTO uploadFile(Long userId, String path, String fileName,
                                      InputStream inputStream, long contentLength, String mimeType) {
        // 兜底：mimeType 为空或为通用二进制类型时，根据文件名后缀推断更精确的类型
        if (mimeType == null || mimeType.isBlank() || "application/octet-stream".equals(mimeType)) {
            String guessed = guessMimeType(fileName);
            if (!"application/octet-stream".equals(guessed)) {
                mimeType = guessed;
            }
        }

        // 1. 校验文件大小
        if (contentLength > storageProperties.getMaxFileSize()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "文件大小超出限制（最大 " + (storageProperties.getMaxFileSize() / 1024 / 1024) + "MB）", 400);
        }

        // 2. 校验配额
        User user = getUserOrThrow(userId);
        if (user.getStorageUsedBytes() + contentLength > user.getStorageQuotaBytes()) {
            throw StorageException.quotaExceeded();
        }

        // 3. 校验目录路径（非根目录时检查目录是否存在）
        if (path != null && !path.isBlank()) {
            fileNameValidator.validatePath(path); // 防路径遍历
            if (!directoryRepository.existsByUserIdAndPath(userId, path)) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "目标目录不存在: " + path, 400);
            }
        }

        // 4. 构建 COS key 并上传
        String cosKey = storageService.buildKey(userId, path, fileName);
        CosObjectResult cosResult = storageService.putObject(cosKey, inputStream, contentLength, mimeType);

        // 5. 保存文件元数据（customOrder 追加到目录末尾，供「自定义」排序使用）
        String dirPath = path != null ? path : "";
        FileEntity fileEntity = FileEntity.builder()
                .userId(userId)
                .fileName(fileNameValidator.validate(fileName))
                .path(dirPath)
                .cosKey(cosKey)
                .sizeBytes(contentLength)
                .mimeType(mimeType)
                .cosEtag(cosResult.getETag())
                .customOrder(fileRepository.findMaxCustomOrder(userId, dirPath) + 1)
                .build();
        fileEntity = fileRepository.save(fileEntity);

        // 6. 原子更新配额（并发安全；配额被并发占用时更新失败，回滚 COS 对象）
        int updated = userRepository.incrementStorageUsedWithQuotaCheck(userId, contentLength);
        if (updated == 0) {
            storageService.deleteObject(cosKey);
            throw StorageException.quotaExceeded();
        }

        log.info("File uploaded: userId={}, fileId={}, cosKey={}, size={}", userId, fileEntity.getId(), cosKey, contentLength);

        // 配额预警：用量超过 80% 时通知用户
        checkQuotaWarning(userId);

        return UploadResultDTO.builder()
                .id(fileEntity.getId())
                .fileName(fileEntity.getFileName())
                .path(fileEntity.getPath())
                .sizeBytes(fileEntity.getSizeBytes())
                .mimeType(fileEntity.getMimeType())
                .build();
    }

    // ==================== 下载 ====================

    /**
     * 生成下载预签名 URL
     *
     * @param userId 用户 ID
     * @param fileId 文件 ID
     * @return 预签名 URL
     */
    public PresignedUrlDTO generateDownloadUrl(Long userId, Long fileId) {
        FileEntity file = getFileForUser(userId, fileId);
        java.net.URL url = storageService.generatePresignedUrl(
                file.getCosKey(), storageProperties.getPresignedUrlExpiry(), "GET", file.getFileName(), true);
        return PresignedUrlDTO.builder()
                .url(url.toString())
                .expirySeconds(storageProperties.getPresignedUrlExpiry())
                .build();
    }

    /**
     * 生成预览预签名 URL
     *
     * @param userId 用户 ID
     * @param fileId 文件 ID
     * @return 预签名 URL
     */
    public PresignedUrlDTO generatePreviewUrl(Long userId, Long fileId) {
        FileEntity file = getFileForUser(userId, fileId);
        java.net.URL url = storageService.generatePresignedUrl(
                file.getCosKey(), storageProperties.getPresignedUrlExpiry(), "GET", file.getFileName(), false, file.getMimeType());
        return PresignedUrlDTO.builder()
                .url(url.toString())
                .expirySeconds(storageProperties.getPresignedUrlExpiry())
                .build();
    }

    /**
     * 获取文本文件预览内容
     *
     * @param userId 用户 ID
     * @param fileId 文件 ID
     * @return 文本内容（截断到 textPreviewSizeLimit）
     */
    public String getTextPreview(Long userId, Long fileId) {
        // 至少需要 VIEW 权限
        FileEntity file = requireFileAccess(userId, fileId, FileAccessLevel.VIEW);
        return readTextPreview(file);
    }

    /**
     * 获取文本文件预览内容（外链分享访客侧使用，已完成鉴权，直接以文件实体入参）
     *
     * @param file 已完成权限校验的文件实体
     * @return 文本内容（截断到 textPreviewSizeLimit）
     */
    public String getTextPreview(FileEntity file) {
        return readTextPreview(file);
    }

    private String readTextPreview(FileEntity file) {
        if (!isTextType(file.getMimeType()) && !isTextFileByName(file.getFileName())) {
            throw StorageException.previewNotSupported("仅支持文本类文件预览，当前类型: " + file.getMimeType());
        }
        try (InputStream is = storageService.getObject(file.getCosKey())) {
            int limit = (int) storageProperties.getTextPreviewSizeLimit();
            byte[] bytes = is.readNBytes(limit + 1);
            boolean truncated = bytes.length > limit;
            if (truncated) {
                bytes = java.util.Arrays.copyOf(bytes, limit);
            }
            String content = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
            return truncated ? content + "\n\n... (文件过大，仅显示前 " + (limit / 1024) + " KB)" : content;
        } catch (StorageException e) {
            throw e;
        } catch (Exception e) {
            throw StorageException.previewFailed(e.getMessage());
        }
    }

    /**
     * 更新文本文件内容（覆盖写入）
     *
     * @param userId  用户 ID
     * @param fileId  文件 ID
     * @param content 新的文本内容
     * @return 更新后的文件信息
     */
    @Transactional
    public FileInfoDTO updateTextContent(Long userId, Long fileId, String content) {
        // 至少需要 EDIT 权限
        FileEntity file = requireFileAccess(userId, fileId, FileAccessLevel.EDIT);

        // 校验文件类型
        if (!isTextType(file.getMimeType()) && !isTextFileByName(file.getFileName())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "仅支持编辑文本类文件", 400);
        }

        byte[] bytes = content.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        long oldSize = file.getSizeBytes();
        long newSize = bytes.length;
        long delta = newSize - oldSize;

        // 校验单文件大小上限
        if (newSize > storageProperties.getMaxFileSize()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "文件大小超出限制（最大 " + (storageProperties.getMaxFileSize() / 1024 / 1024) + "MB）", 400);
        }

        // 原子调整配额：扩大时带配额检查，配额不足直接拒绝（事务回滚时一并撤销）
        if (delta > 0) {
            int updated = userRepository.incrementStorageUsedWithQuotaCheck(file.getUserId(), delta);
            if (updated == 0) {
                throw StorageException.quotaExceeded();
            }
        }

        // 写入 COS（覆盖原文件）；失败时事务回滚，配额调整一并撤销
        try (InputStream is = new java.io.ByteArrayInputStream(bytes)) {
            storageService.putObject(file.getCosKey(), is, bytes.length, file.getMimeType());
        } catch (Exception e) {
            throw StorageException.uploadFailed("更新文件内容失败: " + e.getMessage(), e);
        }

        // 更新文件大小
        file.setSizeBytes(newSize);
        file.setUpdatedAt(java.time.LocalDateTime.now());
        fileRepository.save(file);

        // 缩小场景：原子减少配额（下限 0）
        if (delta < 0) {
            userRepository.decrementStorageUsed(file.getUserId(), -delta);
        }

        log.info("Text content updated: fileId={}, oldSize={}, newSize={}", fileId, oldSize, newSize);
        return toFileInfoDTO(file, isFileShared(file.getId()));
    }

    /**
     * 判断 MIME 类型是否为文本类（可预览）
     */
    private boolean isTextType(String mimeType) {
        if (mimeType == null) return false;
        return mimeType.startsWith("text/")
                || mimeType.startsWith("application/x-shellscript")
                || mimeType.equals("application/json")
                || mimeType.equals("application/xml")
                || mimeType.equals("application/javascript")
                || mimeType.equals("application/x-yaml")
                || mimeType.equals("application/x-yml")
                || mimeType.equals("application/x-sh")
                || mimeType.equals("application/x-python")
                || mimeType.equals("application/x-java-source")
                || mimeType.equals("application/x-csrc")
                || mimeType.equals("application/x-c++src")
                || mimeType.equals("application/x-go")
                || mimeType.equals("application/x-rust")
                || mimeType.equals("application/x-ruby")
                || mimeType.equals("application/x-php")
                || mimeType.equals("application/x-httpd-php")
                || mimeType.equals("application/x-toml")
                || mimeType.equals("application/x-ini")
                || mimeType.equals("application/x-env")
                || mimeType.equals("application/x-sql")
                || mimeType.equals("application/x-latex")
                || mimeType.equals("application/typescript")
                || mimeType.equals("application/x-typescript")
                || mimeType.equals("application/x-jsx")
                || mimeType.equals("application/x-tsx")
                || mimeType.equals("application/x-vue")
                || mimeType.equals("application/x-scss")
                || mimeType.equals("application/x-sass")
                || mimeType.equals("application/x-less")
                || mimeType.equals("application/x-markdown")
                || mimeType.equals("application/x-conf")
                || mimeType.equals("application/x-config");
    }

    /**
     * 根据文件名后缀判断是否为文本文件（兜底：当 MIME 类型为 application/octet-stream 时使用）
     */
    private boolean isTextFileByName(String fileName) {
        if (fileName == null) return false;
        String lower = fileName.toLowerCase();
        return lower.endsWith(".sh") || lower.endsWith(".bash") || lower.endsWith(".zsh")
                || lower.endsWith(".py") || lower.endsWith(".rb") || lower.endsWith(".rs")
                || lower.endsWith(".go") || lower.endsWith(".java") || lower.endsWith(".c")
                || lower.endsWith(".h") || lower.endsWith(".cpp") || lower.endsWith(".hpp")
                || lower.endsWith(".cc") || lower.endsWith(".cs") || lower.endsWith(".php")
                || lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".js")
                || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")
                || lower.endsWith(".vue") || lower.endsWith(".html") || lower.endsWith(".htm")
                || lower.endsWith(".css") || lower.endsWith(".scss") || lower.endsWith(".sass")
                || lower.endsWith(".less") || lower.endsWith(".json") || lower.endsWith(".xml")
                || lower.endsWith(".yml") || lower.endsWith(".yaml") || lower.endsWith(".toml")
                || lower.endsWith(".ini") || lower.endsWith(".cfg") || lower.endsWith(".conf")
                || lower.endsWith(".env") || lower.endsWith(".sql") || lower.endsWith(".md")
                || lower.endsWith(".markdown") || lower.endsWith(".txt") || lower.endsWith(".log")
                || lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".gitignore")
                || lower.endsWith(".dockerfile") || lower.endsWith(".makefile")
                || lower.endsWith(".properties") || lower.endsWith(".gradle")
                || lower.endsWith(".cmake") || lower.endsWith(".dockerignore")
                || lower.endsWith(".editorconfig") || lower.endsWith(".eslintrc")
                || lower.endsWith(".prettierrc") || lower.endsWith(".babelrc")
                || lower.endsWith(".npmrc") || lower.endsWith(".yarnrc");
    }

    // ==================== 列表 ====================

    /**
     * 列出指定目录下的文件（默认按修改时间倒序）
     *
     * @param userId   用户 ID
     * @param path     目录路径（空字符串表示根目录）
     * @param page     页码（从 0 开始）
     * @param pageSize 每页大小
     * @return 分页文件列表
     */
    public Page<FileInfoDTO> listFiles(Long userId, String path, int page, int pageSize) {
        return listFiles(userId, path, page, pageSize, null, null);
    }

    /**
     * 列出指定目录下的文件（Story 5.5：支持排序字段与方向）
     *
     * @param userId   用户 ID
     * @param path     目录路径（空字符串表示根目录）
     * @param page     页码（从 0 开始）
     * @param pageSize 每页大小
     * @param sortBy   排序字段：name / size / updatedAt / type
     * @param sortDir  排序方向：asc / desc
     * @return 分页文件列表
     */
    public Page<FileInfoDTO> listFiles(Long userId, String path, int page, int pageSize,
                                       String sortBy, String sortDir) {
        String dirPath = path != null ? path : "";
        Page<FileEntity> filePage = fileRepository.findByUserIdAndPath(
                userId, dirPath, PageRequest.of(page, pageSize, resolveFileSort(sortBy, sortDir)));
        Set<Long> sharedFileIds = collectSharedFileIds(filePage.getContent());
        return filePage.map(f -> toFileInfoDTO(f, sharedFileIds.contains(f.getId())));
    }

    /**
     * 将外部排序参数解析为 Spring Data Sort。
     *
     * <p>排序属于展示层关注点，非法或缺失的参数一律静默回退到默认值
     * （修改时间倒序），不抛异常，避免前端传参抖动导致列表请求失败。</p>
     *
     * @param sortBy  排序字段：name / size / updatedAt / type
     * @param sortDir 排序方向：asc / desc
     * @return Spring Data Sort 对象
     */
    private Sort resolveFileSort(String sortBy, String sortDir) {
        String field = DEFAULT_SORT_FIELD;
        if (sortBy != null && SORT_FIELD_MAP.containsKey(sortBy)) {
            field = SORT_FIELD_MAP.get(sortBy);
        }
        // 自定义顺序固定升序（序号越小越靠前），方向参数对其无意义
        if ("customOrder".equals(field)) {
            return Sort.by(Sort.Direction.ASC, field);
        }
        Sort.Direction direction = Sort.Direction.DESC;
        if (sortDir != null && "asc".equalsIgnoreCase(sortDir)) {
            direction = Sort.Direction.ASC;
        }
        return Sort.by(direction, field);
    }

    /**
     * 搜索文件
     *
     * @param userId  用户 ID
     * @param keyword 搜索关键词
     * @param page    页码
     * @param pageSize 每页大小
     * @return 分页搜索结果
     */
    public Page<FileInfoDTO> searchFiles(Long userId, String keyword, int page, int pageSize) {
        Page<FileEntity> filePage = fileRepository.findByUserIdAndFileNameContainingIgnoreCase(
                userId, keyword, PageRequest.of(page, pageSize, Sort.by(Sort.Direction.DESC, "createdAt")));
        Set<Long> sharedFileIds = collectSharedFileIds(filePage.getContent());
        return filePage.map(f -> toFileInfoDTO(f, sharedFileIds.contains(f.getId())));
    }

    /**
     * 收集当前列表中已共享给其他用户的文件 ID 集合（批量查询，避免 N+1）
     */
    private Set<Long> collectSharedFileIds(List<FileEntity> files) {
        if (files == null || files.isEmpty()) {
            return Set.of();
        }
        List<Long> fileIds = files.stream().map(FileEntity::getId).collect(Collectors.toList());
        return fileShareRepository.findByFileIdIn(fileIds).stream()
                .map(FileShareEntity::getFileId)
                .collect(Collectors.toSet());
    }

    // ==================== 删除 ====================

    /**
     * 删除文件
     *
     * @param userId 用户 ID
     * @param fileId 文件 ID
     */
    @Transactional
    public void deleteFile(Long userId, Long fileId) {
        FileEntity file = getFileForUser(userId, fileId);
        String cosKey = file.getCosKey();
        long sizeBytes = file.getSizeBytes();

        // 1. 删除该文件的外链分享记录（外键已级联，此处显式清理兜底）
        fileShareLinkRepository.deleteByFileId(fileId);

        // 2. 先删除元数据并回退配额
        //    顺序要求：先库后 COS。反过来的话，COS 删除成功但事务回滚时，
        //    数据库记录仍指向一个已删除的对象，用户侧表现为"文件还在但打不开"，数据实质已丢失。
        fileRepository.delete(file);
        userRepository.decrementStorageUsed(userId, sizeBytes);

        // 3. 最后删除 COS 对象：失败仅残留孤立对象，由 OrphanFileCleanupJob 兜底回收
        try {
            storageService.deleteObject(cosKey);
        } catch (Exception e) {
            log.error("COS 对象删除失败，残留为孤立文件待清理: cosKey={}, error={}", cosKey, e.getMessage());
        }

        log.info("File deleted: userId={}, fileId={}, cosKey={}", userId, fileId, cosKey);
    }

    /**
     * 批量删除文件（单事务，全成功/全失败二态）
     * <p>
     * 先逐个校验归属，任一文件不存在或不属于当前用户则整批拒绝（抛异常回滚）。
     * 校验通过后逐个执行删除，COS 删除失败仅残留孤立对象，由清理任务兜底。
     *
     * @param userId  用户 ID
     * @param fileIds 文件 ID 列表
     * @return 成功删除的文件 ID 列表（全成功场景 failed 恒为空）
     */
    @Transactional
    public BatchResult batchDeleteFiles(Long userId, List<Long> fileIds) {
        if (fileIds == null || fileIds.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "fileIds 不能为空", 400);
        }

        // 1. 预校验：全部文件必须存在且属于当前用户，任一失败整批拒绝
        List<FileEntity> files = fileIds.stream()
                .map(id -> getFileForUser(userId, id))
                .collect(Collectors.toList());

        // 2. 逐个执行删除（与单文件删除相同的顺序：分享外链 → DB → 配额 → COS）
        List<Long> successIds = new ArrayList<>(fileIds.size());
        long totalSize = 0;
        for (FileEntity file : files) {
            fileShareLinkRepository.deleteByFileId(file.getId());
            fileRepository.delete(file);
            totalSize += file.getSizeBytes();
            successIds.add(file.getId());
        }
        if (totalSize > 0) {
            userRepository.decrementStorageUsed(userId, totalSize);
        }

        // 3. COS 删除放在 DB 操作之后：单个失败不影响整体，残留对象由清理任务回收
        for (FileEntity file : files) {
            try {
                storageService.deleteObject(file.getCosKey());
            } catch (Exception e) {
                log.error("批量删除时 COS 对象删除失败，残留为孤立文件待清理: cosKey={}, error={}",
                        file.getCosKey(), e.getMessage());
            }
        }

        log.info("Batch delete completed: userId={}, count={}, sizeFreed={}", userId, successIds.size(), totalSize);
        return new BatchResult(successIds, List.of());
    }

    /**
     * 批量移动文件到目标目录（单事务，全成功/全失败二态）
     * <p>
     * 先校验全部归属与目标目录，任一失败整批拒绝。
     * 移动为纯元数据更新（FR-27），cos_key 不变，批量移动同样与文件大小无关。
     *
     * @param userId     用户 ID
     * @param fileIds    文件 ID 列表
     * @param targetPath 目标目录路径（空字符串表示根目录）
     * @return 成功移动的文件 ID 列表
     */
    @Transactional
    public BatchResult batchMoveFiles(Long userId, List<Long> fileIds, String targetPath) {
        if (fileIds == null || fileIds.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "fileIds 不能为空", 400);
        }
        String destPath = targetPath != null ? targetPath : "";

        // 1. 校验目标目录
        if (!destPath.isBlank()) {
            fileNameValidator.validatePath(destPath);
            if (!directoryRepository.existsByUserIdAndPath(userId, destPath)) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "目标目录不存在: " + destPath, 400);
            }
        }

        // 2. 预校验全部归属，任一失败整批拒绝
        List<FileEntity> files = fileIds.stream()
                .map(id -> getFileForUser(userId, id))
                .collect(Collectors.toList());

        // 3. 逐个执行移动（FR-27：纯元数据更新，cos_key 不变，无 COS 调用）
        // 进入目标目录的自定义顺序从末尾依次追加
        int nextOrder = fileRepository.findMaxCustomOrder(userId, destPath);
        List<Long> successIds = new ArrayList<>(fileIds.size());
        for (FileEntity file : files) {
            file.setPath(destPath);
            file.setCustomOrder(++nextOrder);
            fileRepository.save(file);
            successIds.add(file.getId());
        }

        log.info("Batch move completed: userId={}, count={}, targetPath={}", userId, successIds.size(), destPath);
        return new BatchResult(successIds, List.of());
    }

    /**
     * 批量操作结果（全成功/全失败二态，failed 恒为空列表，保留字段以便前端统一解析）
     */
    public record BatchResult(List<Long> success, List<Long> failed) {
    }

    // ==================== 重命名 ====================

    /**
     * 重命名文件
     *
     * @param userId   用户 ID
     * @param fileId   文件 ID
     * @param newName  新文件名
     */
    @Transactional
    public FileInfoDTO renameFile(Long userId, Long fileId, String newName) {
        // 至少需要 EDIT 权限
        FileEntity file = requireFileAccess(userId, fileId, FileAccessLevel.EDIT);
        String safeName = fileNameValidator.validate(newName);

        // FR-27（Story 5.6）：cos_key 与文件名解耦 —— key 在文件生命周期内保持不变，
        // 重命名只是元数据更新，不再做 COS copy + delete。
        // 收益：不再产生孤立对象、不再有"大文件改名慢"的问题、重命名可随事务回滚。
        file.setFileName(safeName);
        file = fileRepository.save(file);

        log.info("File renamed: userId={}, fileId={}, newName={}", userId, fileId, safeName);
        return toFileInfoDTO(file, isFileShared(file.getId()));
    }

    // ==================== 移动 ====================

    /**
     * 移动文件到新目录
     *
     * @param userId     用户 ID
     * @param fileId     文件 ID
     * @param newPath    新目录路径
     */
    @Transactional
    public FileInfoDTO moveFile(Long userId, Long fileId, String newPath) {
        FileEntity file = getFileForUser(userId, fileId);
        String targetPath = newPath != null ? newPath : "";

        // 校验目标目录
        if (!targetPath.isBlank()) {
            fileNameValidator.validatePath(targetPath);
            if (!directoryRepository.existsByUserIdAndPath(userId, targetPath)) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "目标目录不存在: " + targetPath, 400);
            }
        }

        // FR-27（Story 5.6）：cos_key 与目录路径解耦 —— 移动只更新 path 字段，
        // 不触碰 COS，因此耗时与文件大小无关（实测 < 100ms），大文件移动瞬时完成。
        file.setPath(targetPath);
        // 进入新目录时追加到自定义顺序末尾，避免沿用旧目录序号造成插队
        file.setCustomOrder(fileRepository.findMaxCustomOrder(userId, targetPath) + 1);
        file = fileRepository.save(file);

        log.info("File moved: userId={}, fileId={}, newPath={}", userId, fileId, targetPath);
        return toFileInfoDTO(file, isFileShared(file.getId()));
    }

    /**
     * 保存目录内的自定义排序（「自定义」排序模式，前端拖拽后整体提交）。
     *
     * <p>fileIds 必须是该目录下全部文件的有序列表，按序重写 custom_order。
     * 任一文件不属于该用户或不在该目录时整批拒绝。使用批量 UPDATE，
     * 不触发 @PreUpdate，避免调整顺序污染 updated_at。</p>
     *
     * @param userId  用户 ID
     * @param path    目录路径（空字符串表示根目录）
     * @param fileIds 按新顺序排列的文件 ID 列表
     */
    @Transactional
    public void updateCustomOrder(Long userId, String path, List<Long> fileIds) {
        if (fileIds == null || fileIds.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "fileIds 不能为空", 400);
        }
        String dirPath = path != null ? path : "";

        // 预校验全部归属与目录一致性，任一失败整批拒绝
        List<FileEntity> files = fileIds.stream()
                .map(id -> getFileForUser(userId, id))
                .collect(Collectors.toList());
        for (FileEntity file : files) {
            if (!dirPath.equals(file.getPath())) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "文件不在指定目录中: " + file.getFileName(), 400);
            }
        }

        int order = 0;
        for (Long id : fileIds) {
            fileRepository.updateCustomOrderById(id, userId, order++);
        }
        log.info("Custom order updated: userId={}, path={}, count={}", userId, dirPath, fileIds.size());
    }

    // ==================== 目录管理 ====================

    /**
     * 创建目录
     *
     * @param userId     用户 ID
     * @param name       目录名
     * @param parentPath 父目录路径（空字符串表示根目录下）
     * @return 目录信息
     */
    @Transactional
    public DirectoryEntity createDirectory(Long userId, String name, String parentPath) {
        String safeName = fileNameValidator.validateDirectoryName(name);
        String parent = parentPath != null ? parentPath : "";

        // 构建目录路径
        String dirPath = parent.isBlank() ? safeName : parent + "/" + safeName;

        // 检查是否已存在
        if (directoryRepository.existsByUserIdAndPath(userId, dirPath)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "目录已存在: " + dirPath, 400);
        }

        // 校验父目录存在
        if (!parent.isBlank() && !directoryRepository.existsByUserIdAndPath(userId, parent)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "父目录不存在: " + parent, 400);
        }

        DirectoryEntity dir = DirectoryEntity.builder()
                .userId(userId)
                .name(safeName)
                .path(dirPath)
                .parentPath(parent)
                .build();
        dir = directoryRepository.save(dir);

        log.info("Directory created: userId={}, dirPath={}", userId, dirPath);
        return dir;
    }

    /**
     * 列出子目录（默认按名称升序）
     *
     * @param userId     用户 ID
     * @param parentPath 父目录路径
     * @return 子目录列表
     */
    public List<DirectoryEntity> listDirectories(Long userId, String parentPath) {
        return listDirectories(userId, parentPath, null);
    }

    /**
     * 列出子目录（Story 5.5：目录按名称排序，支持方向切换）
     *
     * <p>目录始终按名称排序（不支持按大小/类型），仅方向可切；
     * 「目录置顶」由前端合并目录与文件两个列表时保证，后端不做混合排序。</p>
     *
     * @param userId     用户 ID
     * @param parentPath 父目录路径
     * @param sortDir    排序方向：asc / desc，默认 asc
     * @return 子目录列表
     */
    public List<DirectoryEntity> listDirectories(Long userId, String parentPath, String sortDir) {
        String parent = parentPath != null ? parentPath : "";
        Sort.Direction direction = Sort.Direction.ASC;
        if (sortDir != null && "desc".equalsIgnoreCase(sortDir)) {
            direction = Sort.Direction.DESC;
        }
        return directoryRepository.findByUserIdAndParentPath(userId, parent, Sort.by(direction, "name"));
    }

    /**
     * 构建用户目录树
     *
     * @param userId 用户 ID
     * @return 目录树根节点列表
     */
    public List<DirectoryTreeDTO> getDirectoryTree(Long userId) {
        List<DirectoryEntity> allDirs = directoryRepository.findByUserIdOrderByPathAsc(userId);
        Map<Long, DirectoryTreeDTO> nodeMap = new HashMap<>();
        List<DirectoryTreeDTO> roots = new ArrayList<>();

        for (DirectoryEntity dir : allDirs) {
            DirectoryTreeDTO node = DirectoryTreeDTO.builder()
                    .id(dir.getId())
                    .name(dir.getName())
                    .path(dir.getPath())
                    .children(new ArrayList<>())
                    .build();
            nodeMap.put(dir.getId(), node);

            String parent = dir.getParentPath();
            if (parent == null || parent.isEmpty()) {
                roots.add(node);
            } else {
                DirectoryEntity parentDir = allDirs.stream()
                        .filter(d -> d.getPath().equals(parent))
                        .findFirst()
                        .orElse(null);
                if (parentDir != null) {
                    DirectoryTreeDTO parentNode = nodeMap.get(parentDir.getId());
                    if (parentNode != null && parentNode.getChildren() != null) {
                        parentNode.getChildren().add(node);
                    }
                }
            }
        }
        return roots;
    }

    /**
     * 删除目录及其下所有文件
     *
     * @param userId 用户 ID
     * @param dirId  目录 ID
     */
    @Transactional
    public void deleteDirectory(Long userId, Long dirId) {
        DirectoryEntity dir = directoryRepository.findById(dirId)
                .filter(d -> d.getUserId().equals(userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED, "目录不存在", 404));

        // 1. 查找目录下所有文件（含子目录中的文件）
        List<FileEntity> files = fileRepository.findByUserIdAndPathPrefix(userId, dir.getPath());
        long totalSize = 0;
        List<String> cosKeys = new ArrayList<>();
        for (FileEntity file : files) {
            cosKeys.add(file.getCosKey());
            totalSize += file.getSizeBytes();
        }

        // 2. 先删除数据库记录、子目录并回退配额（顺序要求同 deleteFile：先库后 COS）
        fileRepository.deleteByUserIdAndPathPrefix(userId, dir.getPath());
        directoryRepository.deleteByUserIdAndPathPrefix(userId, dir.getPath());
        if (totalSize > 0) {
            userRepository.decrementStorageUsed(userId, totalSize);
        }

        // 3. 最后删除 COS 对象：单个失败不影响整体，残留对象由清理任务回收
        for (String cosKey : cosKeys) {
            try {
                storageService.deleteObject(cosKey);
            } catch (Exception e) {
                log.error("目录删除时 COS 对象删除失败，残留为孤立文件待清理: cosKey={}, error={}", cosKey, e.getMessage());
            }
        }

        log.info("Directory deleted: userId={}, dirPath={}, filesDeleted={}, sizeFreed={}",
                userId, dir.getPath(), files.size(), totalSize);
    }

    // ==================== 目录重命名 / 移动（Story 5.6 / FR-28） ====================

    /**
     * 重命名目录，级联更新子目录与子文件的路径前缀。
     *
     * <p>纯数据库操作，不触碰 COS（FR-27：cos_key 与路径解耦）。
     * 路径前缀替换用 {@code oldPrefix + "/"} 匹配，避免误伤同名兄弟目录
     * （如 {@code docs} 与 {@code docs-backup}）。</p>
     *
     * @param userId  用户 ID
     * @param dirId   目录 ID
     * @param newName 新目录名
     * @return 更新后的目录实体
     */
    @Transactional
    public DirectoryEntity renameDirectory(Long userId, Long dirId, String newName) {
        DirectoryEntity dir = directoryRepository.findById(dirId)
                .filter(d -> d.getUserId().equals(userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED, "目录不存在", 404));

        String safeName = fileNameValidator.validateDirectoryName(newName);
        String oldPath = dir.getPath();
        String parentPath = dir.getParentPath();
        String newPath = parentPath.isBlank() ? safeName : parentPath + "/" + safeName;

        // 同级同名检查
        if (!oldPath.equals(newPath) && directoryRepository.existsByUserIdAndPath(userId, newPath)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "同名目录已存在: " + newPath, 409);
        }

        // 更新目录自身
        dir.setName(safeName);
        dir.setPath(newPath);
        directoryRepository.save(dir);

        // 级联更新子目录与子文件
        cascadePathPrefix(userId, oldPath, newPath);

        log.info("Directory renamed: userId={}, dirId={}, oldPath={}, newPath={}", userId, dirId, oldPath, newPath);
        return dir;
    }

    /**
     * 移动目录到新父目录，级联更新路径前缀。
     *
     * <p>防循环校验：不能移动到自身或自身子目录下。
     * 纯数据库操作，不触碰 COS。</p>
     *
     * @param userId           用户 ID
     * @param dirId            目录 ID
     * @param targetParentPath 目标父目录路径（空字符串表示根目录）
     * @return 更新后的目录实体
     */
    @Transactional
    public DirectoryEntity moveDirectory(Long userId, Long dirId, String targetParentPath) {
        DirectoryEntity dir = directoryRepository.findById(dirId)
                .filter(d -> d.getUserId().equals(userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED, "目录不存在", 404));

        String targetParent = targetParentPath != null ? targetParentPath : "";
        String oldPath = dir.getPath();

        // 校验目标父目录存在（根目录除外）
        if (!targetParent.isBlank()) {
            fileNameValidator.validatePath(targetParent);
            if (!directoryRepository.existsByUserIdAndPath(userId, targetParent)) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "目标目录不存在: " + targetParent, 400);
            }
        }

        // 防循环：不能移动到自身或自身子目录
        if (targetParent.equals(oldPath) || targetParent.startsWith(oldPath + "/")) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "不能将目录移动到自身或其子目录下", 400);
        }

        String newPath = targetParent.isBlank() ? dir.getName() : targetParent + "/" + dir.getName();

        // 同级同名检查
        if (!oldPath.equals(newPath) && directoryRepository.existsByUserIdAndPath(userId, newPath)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "目标位置已存在同名目录: " + newPath, 409);
        }

        // 更新目录自身
        dir.setPath(newPath);
        dir.setParentPath(targetParent);
        directoryRepository.save(dir);

        // 级联更新子目录与子文件
        cascadePathPrefix(userId, oldPath, newPath);

        log.info("Directory moved: userId={}, dirId={}, oldPath={}, newPath={}", userId, dirId, oldPath, newPath);
        return dir;
    }

    /**
     * 级联替换路径前缀：将 oldPath 及其子目录/子文件的路径前缀从 oldPath 替换为 newPath。
     *
     * <p>匹配规则：path 等于 oldPath 或以 {@code oldPath + "/"} 开头的记录。
     * 替换方式：{@code newPath + value.substring(oldPath.length())}，
     * 保留子路径后缀（如 {@code docs/a/b.txt} → {@code archive/docs/a/b.txt}）。</p>
     *
     * @param userId  用户 ID
     * @param oldPath 旧路径前缀
     * @param newPath 新路径前缀
     */
    private void cascadePathPrefix(Long userId, String oldPath, String newPath) {
        String oldPrefix = oldPath + "/";

        // 子目录：path 和 parentPath 都需要替换前缀
        List<DirectoryEntity> subDirs = directoryRepository.findByUserIdAndPathPrefix(userId, oldPath);
        for (DirectoryEntity d : subDirs) {
            if (d.getPath().equals(oldPath)) {
                // 目录自身已在调用方更新，跳过
                continue;
            }
            // 安全检查：只处理以 oldPath + "/" 开头的子目录（排除 docs-backup 这种兄弟）
            if (!d.getPath().startsWith(oldPrefix)) {
                continue;
            }
            d.setPath(newPath + d.getPath().substring(oldPath.length()));
            if (!d.getParentPath().isBlank() && (d.getParentPath().equals(oldPath) || d.getParentPath().startsWith(oldPrefix))) {
                d.setParentPath(newPath + d.getParentPath().substring(oldPath.length()));
            }
            directoryRepository.save(d);
        }

        // 子文件：只替换 path
        List<FileEntity> subFiles = fileRepository.findByUserIdAndPathPrefix(userId, oldPath);
        for (FileEntity f : subFiles) {
            // 安全检查：只处理 path 等于 oldPath 或以 oldPath + "/" 开头的文件
            if (f.getPath().equals(oldPath)) {
                f.setPath(newPath);
            } else if (f.getPath().startsWith(oldPrefix)) {
                f.setPath(newPath + f.getPath().substring(oldPath.length()));
            }
            // 不匹配前缀的跳过（防误伤）
            fileRepository.save(f);
        }
    }

    // ==================== 配额 ====================

    /**
     * 获取用户存储配额信息
     *
     * @param userId 用户 ID
     * @return 配额信息
     */
    public QuotaInfoDTO getQuotaInfo(Long userId) {
        User user = getUserOrThrow(userId);
        return QuotaInfoDTO.builder()
                .usedBytes(user.getStorageUsedBytes())
                .quotaBytes(user.getStorageQuotaBytes())
                .usagePercent(user.getStorageQuotaBytes() > 0
                        ? Math.round(user.getStorageUsedBytes() * 100.0 / user.getStorageQuotaBytes() * 100) / 100.0
                        : 0.0)
                .build();
    }

    // ==================== 共享管理 ====================

    /**
     * 共享文件给指定用户
     *
     * @param ownerUserId 文件所有者 ID
     * @param fileId      文件 ID
     * @param targetUserId 被共享用户 ID
     * @param permission  共享权限（VIEW / EDIT）
     * @return 共享记录
     */
    @Transactional
    public ShareDTO shareFile(Long ownerUserId, Long fileId, Long targetUserId, String permission) {
        // 1. 校验文件属于当前用户
        FileEntity file = getFileForUser(ownerUserId, fileId);

        // 2. 不能共享给自己
        if (ownerUserId.equals(targetUserId)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "不能共享文件给自己", 400);
        }

        // 3. 校验目标用户存在
        User targetUser = userRepository.findById(targetUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "目标用户不存在", 404));

        // 4. 解析权限
        FileShareEntity.SharePermission sharePermission = parsePermission(permission);

        // 5. 检查是否已共享（存在则更新权限）
        FileShareEntity share = fileShareRepository.findByFileIdAndSharedWithUserId(fileId, targetUserId)
                .orElse(null);

        if (share != null) {
            share.setPermission(sharePermission);
            share = fileShareRepository.save(share);
            log.info("Share updated: fileId={}, targetUserId={}, permission={}", fileId, targetUserId, sharePermission);
        } else {
            share = FileShareEntity.builder()
                    .fileId(fileId)
                    .sharedWithUserId(targetUserId)
                    .permission(sharePermission)
                    .build();
            share = fileShareRepository.save(share);
            log.info("Share created: fileId={}, targetUserId={}, permission={}", fileId, targetUserId, sharePermission);
        }

        return toShareDTO(share, targetUser.getUsername());
    }

    /**
     * 取消共享
     *
     * @param ownerUserId 文件所有者 ID
     * @param fileId      文件 ID
     * @param shareId     共享记录 ID
     */
    @Transactional
    public void unshareFile(Long ownerUserId, Long fileId, Long shareId) {
        // 校验文件属于当前用户
        getFileForUser(ownerUserId, fileId);

        FileShareEntity share = fileShareRepository.findById(shareId)
                .filter(s -> s.getFileId().equals(fileId))
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED, "共享记录不存在", 404));

        fileShareRepository.delete(share);
        log.info("Share removed: fileId={}, shareId={}", fileId, shareId);
    }

    /**
     * 更新共享记录的权限（可编辑 / 可查看）
     *
     * @param ownerUserId 文件所有者 ID
     * @param fileId      文件 ID
     * @param shareId     共享记录 ID
     * @param permission  新的共享权限（VIEW / EDIT）
     * @return 更新后的共享记录
     */
    @Transactional
    public ShareDTO updateSharePermission(Long ownerUserId, Long fileId, Long shareId, String permission) {
        // 校验文件属于当前用户
        getFileForUser(ownerUserId, fileId);

        FileShareEntity share = fileShareRepository.findById(shareId)
                .filter(s -> s.getFileId().equals(fileId))
                .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED, "共享记录不存在", 404));

        FileShareEntity.SharePermission sharePermission = parsePermission(permission);
        share.setPermission(sharePermission);
        share = fileShareRepository.save(share);

        String username = userRepository.findById(share.getSharedWithUserId())
                .map(User::getUsername)
                .orElse("未知用户");

        log.info("Share permission updated: fileId={}, shareId={}, permission={}", fileId, shareId, sharePermission);
        return toShareDTO(share, username);
    }

    /**
     * 查看文件的共享列表
     *
     * @param ownerUserId 文件所有者 ID
     * @param fileId      文件 ID
     * @return 共享记录列表
     */
    public List<ShareDTO> listFileShares(Long ownerUserId, Long fileId) {
        // 校验文件属于当前用户
        getFileForUser(ownerUserId, fileId);

        List<FileShareEntity> shares = fileShareRepository.findByFileId(fileId);
        return shares.stream()
                .map(share -> {
                    String username = userRepository.findById(share.getSharedWithUserId())
                            .map(User::getUsername)
                            .orElse("未知用户");
                    return toShareDTO(share, username);
                })
                .collect(Collectors.toList());
    }

    /**
     * 查看共享给我的文件列表
     *
     * @param userId 当前用户 ID
     * @return 共享文件列表
     */
    public List<SharedWithMeDTO> listSharedWithMe(Long userId) {
        List<FileShareEntity> shares = fileShareRepository.findBySharedWithUserId(userId);
        return shares.stream()
                .map(share -> {
                    FileEntity file = fileRepository.findById(share.getFileId()).orElse(null);
                    if (file == null) return null;

                    String ownerUsername = userRepository.findById(file.getUserId())
                            .map(User::getUsername)
                            .orElse("未知用户");

                    return SharedWithMeDTO.builder()
                            .shareId(share.getId())
                            .fileId(file.getId())
                            .fileName(file.getFileName())
                            .path(file.getPath())
                            .sizeBytes(file.getSizeBytes())
                            .mimeType(file.getMimeType())
                            .permission(share.getPermission().name())
                            .ownerUserId(file.getUserId())
                            .ownerUsername(ownerUsername)
                            .sharedAt(share.getCreatedAt() != null ? share.getCreatedAt().format(DATE_FORMATTER) : null)
                            .build();
                })
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toList());
    }

    /**
     * 将共享给我的文件复制到我的文件（根目录）
     * <p>
     * 仅要求对源文件有 VIEW 及以上访问权限。复制后生成一份归属于当前用户的新文件，
     * 与原共享文件相互独立。若根目录已存在同名文件，则自动追加序号后缀。
     *
     * @param userId 当前用户 ID
     * @param fileId 共享文件 ID
     * @return 复制后生成的新文件信息
     */
    @Transactional
    public FileInfoDTO copySharedFileToMine(Long userId, Long fileId, String targetPath) {
        String destPath = targetPath == null ? "" : targetPath;
        // 1. 校验访问权（VIEW 即可复制）
        FileEntity src = requireFileAccess(userId, fileId, FileAccessLevel.VIEW);

        // 2. 校验配额
        User user = getUserOrThrow(userId);
        long size = src.getSizeBytes();
        if (user.getStorageUsedBytes() + size > user.getStorageQuotaBytes()) {
            throw StorageException.quotaExceeded();
        }

        // 3. 处理目标目录重名
        String targetName = resolveCopyName(userId, destPath, src.getFileName());

        // 4. 复制 COS 对象到目标目录
        String targetCosKey = storageService.buildKey(userId, destPath, targetName);
        storageService.copyObject(src.getCosKey(), targetCosKey);

        // 5. 保存新文件元数据（customOrder 追加到目录末尾）
        FileEntity newFile = FileEntity.builder()
                .userId(userId)
                .fileName(targetName)
                .path(destPath)
                .cosKey(targetCosKey)
                .sizeBytes(size)
                .mimeType(src.getMimeType())
                .customOrder(fileRepository.findMaxCustomOrder(userId, destPath) + 1)
                .build();
        newFile = fileRepository.save(newFile);

        // 6. 原子更新配额（并发安全；配额被并发占用时更新失败，回滚 COS 对象）
        int updated = userRepository.incrementStorageUsedWithQuotaCheck(userId, size);
        if (updated == 0) {
            storageService.deleteObject(targetCosKey);
            throw StorageException.quotaExceeded();
        }

        log.info("Shared file copied to mine: srcFileId={}, newFileId={}, userId={}, path={}", fileId, newFile.getId(), userId, destPath);
        return toFileInfoDTO(newFile, false);
    }

    /**
     * 解析复制文件的目标文件名，若目标目录已存在同名则追加序号
     */
    private String resolveCopyName(Long userId, String path, String originalName) {
        if (fileRepository.findByUserIdAndPathAndFileName(userId, path, originalName).isEmpty()) {
            return originalName;
        }
        int dot = originalName.lastIndexOf('.');
        String base = dot > 0 ? originalName.substring(0, dot) : originalName;
        String ext = dot > 0 ? originalName.substring(dot) : "";
        int i = 1;
        String candidate;
        do {
            candidate = base + " (" + i + ")" + ext;
            i++;
        } while (!fileRepository.findByUserIdAndPathAndFileName(userId, path, candidate).isEmpty());
        return candidate;
    }

    // ==================== 权限检查 ====================

    /**
     * 检查用户对文件的访问权限
     *
     * @param userId 用户 ID
     * @param fileId 文件 ID
     * @return 权限级别：OWNER / EDIT / VIEW / NONE
     */
    public FileAccessLevel checkFileAccess(Long userId, Long fileId) {
        FileEntity file = fileRepository.findById(fileId).orElse(null);
        if (file == null) return FileAccessLevel.NONE;

        // 所有者
        if (file.getUserId().equals(userId)) return FileAccessLevel.OWNER;

        // 共享权限
        return fileShareRepository.findByFileIdAndSharedWithUserId(fileId, userId)
                .map(share -> share.getPermission() == FileShareEntity.SharePermission.EDIT
                        ? FileAccessLevel.EDIT
                        : FileAccessLevel.VIEW)
                .orElse(FileAccessLevel.NONE);
    }

    /**
     * 获取文件实体（支持共享用户访问，返回文件实体和权限级别）
     *
     * @param userId 用户 ID
     * @param fileId 文件 ID
     * @return 文件访问上下文
     */
    public FileAccessContext getFileWithAccess(Long userId, Long fileId) {
        FileEntity file = fileRepository.findById(fileId)
                .orElseThrow(StorageException::fileNotFound);

        FileAccessLevel level;
        if (file.getUserId().equals(userId)) {
            level = FileAccessLevel.OWNER;
        } else {
            level = fileShareRepository.findByFileIdAndSharedWithUserId(fileId, userId)
                    .map(share -> share.getPermission() == FileShareEntity.SharePermission.EDIT
                            ? FileAccessLevel.EDIT
                            : FileAccessLevel.VIEW)
                    .orElseThrow(() -> new BusinessException(ErrorCode.PERMISSION_DENIED, "无权访问该文件", 403));
        }

        return new FileAccessContext(file, level);
    }

    /**
     * 要求至少有指定权限级别才能访问
     *
     * @param userId     用户 ID
     * @param fileId     文件 ID
     * @param minLevel   最低权限级别
     * @return 文件实体
     */
    public FileEntity requireFileAccess(Long userId, Long fileId, FileAccessLevel minLevel) {
        FileAccessContext ctx = getFileWithAccess(userId, fileId);
        if (ctx.getLevel().ordinal() < minLevel.ordinal()) {
            throw new BusinessException(ErrorCode.PERMISSION_DENIED, "权限不足，需要 " + minLevel.name() + " 权限", 403);
        }
        return ctx.getFile();
    }

    /**
     * 文件访问权限级别
     */
    public enum FileAccessLevel {
        NONE, VIEW, EDIT, OWNER
    }

    /**
     * 文件访问上下文
     */
    @lombok.Data
    @lombok.AllArgsConstructor
    public static class FileAccessContext {
        private FileEntity file;
        private FileAccessLevel level;
    }

    // ==================== 内部方法 ====================

    /**
     * 获取文件实体（供 Controller 直接使用，如预览/下载代理）
     * 支持共享用户访问（至少需要 VIEW 权限）
     */
    public FileEntity getFileEntityForUser(Long userId, Long fileId) {
        return requireFileAccess(userId, fileId, FileAccessLevel.VIEW);
    }

    private FileEntity getFileForUser(Long userId, Long fileId) {
        return fileRepository.findById(fileId)
                .filter(f -> f.getUserId().equals(userId))
                .orElseThrow(StorageException::fileNotFound);
    }

    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
    }

    /**
     * 根据文件名后缀推断 MIME 类型
     */
    private String guessMimeType(String fileName) {
        if (fileName == null) {
            return "application/octet-stream";
        }
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".bmp")) return "image/bmp";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js")) return "text/javascript";
        if (lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".cjs")) return "text/javascript";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".xml")) return "application/xml";
        if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "application/x-yaml";
        if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
        if (lower.endsWith(".sh") || lower.endsWith(".bash") || lower.endsWith(".zsh")) return "application/x-sh";
        if (lower.endsWith(".py")) return "text/x-python";
        if (lower.endsWith(".java")) return "text/x-java-source";
        if (lower.endsWith(".c") || lower.endsWith(".h")) return "text/x-csrc";
        if (lower.endsWith(".cpp") || lower.endsWith(".hpp") || lower.endsWith(".cc")) return "text/x-c++src";
        if (lower.endsWith(".go")) return "text/x-go";
        if (lower.endsWith(".rs")) return "text/x-rust";
        if (lower.endsWith(".rb")) return "text/x-ruby";
        if (lower.endsWith(".php")) return "text/x-php";
        if (lower.endsWith(".ts")) return "application/typescript";
        if (lower.endsWith(".tsx")) return "application/x-tsx";
        if (lower.endsWith(".jsx")) return "application/x-jsx";
        if (lower.endsWith(".vue")) return "application/x-vue";
        if (lower.endsWith(".scss")) return "application/x-scss";
        if (lower.endsWith(".sass")) return "application/x-sass";
        if (lower.endsWith(".less")) return "application/x-less";
        if (lower.endsWith(".toml")) return "application/x-toml";
        if (lower.endsWith(".ini") || lower.endsWith(".cfg")) return "application/x-ini";
        if (lower.endsWith(".env")) return "application/x-env";
        if (lower.endsWith(".sql")) return "application/x-sql";
        if (lower.endsWith(".conf")) return "application/x-conf";
        if (lower.endsWith(".log")) return "text/plain";
        if (lower.endsWith(".csv")) return "text/csv";
        if (lower.endsWith(".tsv")) return "text/tab-separated-values";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".rtf")) return "application/rtf";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".doc")) return "application/msword";
        if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
        if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (lower.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
        if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        if (lower.endsWith(".zip")) return "application/zip";
        return "application/octet-stream";
    }

    private FileInfoDTO toFileInfoDTO(FileEntity entity) {
        return toFileInfoDTO(entity, isFileShared(entity.getId()));
    }

    private boolean isFileShared(Long fileId) {
        return !fileShareRepository.findByFileId(fileId).isEmpty();
    }

    private FileInfoDTO toFileInfoDTO(FileEntity entity, boolean shared) {
        return FileInfoDTO.builder()
                .id(entity.getId())
                .fileName(entity.getFileName())
                .path(entity.getPath())
                .sizeBytes(entity.getSizeBytes())
                .mimeType(entity.getMimeType())
                .createdAt(entity.getCreatedAt() != null ? entity.getCreatedAt().format(DATE_FORMATTER) : null)
                .updatedAt(entity.getUpdatedAt() != null ? entity.getUpdatedAt().format(DATE_FORMATTER) : null)
                .shared(shared)
                .build();
    }

    private ShareDTO toShareDTO(FileShareEntity share, String sharedWithUsername) {
        return ShareDTO.builder()
                .id(share.getId())
                .fileId(share.getFileId())
                .sharedWithUserId(share.getSharedWithUserId())
                .sharedWithUsername(sharedWithUsername)
                .permission(share.getPermission().name())
                .createdAt(share.getCreatedAt() != null ? share.getCreatedAt().format(DATE_FORMATTER) : null)
                .build();
    }

    private FileShareEntity.SharePermission parsePermission(String permission) {
        if (permission == null || permission.isBlank()) {
            return FileShareEntity.SharePermission.VIEW;
        }
        try {
            return FileShareEntity.SharePermission.valueOf(permission.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "无效的共享权限: " + permission + "，仅支持 VIEW 和 EDIT", 400);
        }
    }

    /**
     * 配额预警：用量超过 80% 时发送通知
     */
    private void checkQuotaWarning(Long userId) {
        try {
            QuotaInfoDTO quota = getQuotaInfo(userId);
            if (quota.getUsagePercent() != null && quota.getUsagePercent() >= 80) {
                String level = quota.getUsagePercent() >= 95 ? "已超过 95%" : "已超过 80%";
                String usedMB = String.format("%.1f", quota.getUsedBytes() / 1024.0 / 1024.0);
                String quotaMB = String.format("%.1f", quota.getQuotaBytes() / 1024.0 / 1024.0);
                notificationService.createSystemNotification(
                        userId,
                        "存储空间预警",
                        String.format("您的存储空间使用量%s（已用 %s MB / 总计 %s MB），请及时清理不需要的文件。",
                                level, usedMB, quotaMB)
                );
            }
        } catch (Exception e) {
            log.warn("配额预警检查失败: userId={}, error={}", userId, e.getMessage());
        }
    }

    /**
     * 配额信息 DTO
     */
    @lombok.Data
    @lombok.Builder
    public static class QuotaInfoDTO {
        private Long usedBytes;
        private Long quotaBytes;
        private Double usagePercent;
    }
}
