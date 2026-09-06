package com.miao.toolbox.storage.service;

import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.storage.dto.TrashItemDTO;
import com.miao.toolbox.storage.dto.TrashItemDTO.TrashViewDTO;
import com.miao.toolbox.storage.entity.DirectoryEntity;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.repository.DirectoryRepository;
import com.miao.toolbox.storage.repository.FileRepository;
import com.miao.toolbox.storage.repository.FileShareLinkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 废纸篓业务（V32）：软删除项的查看 / 恢复 / 彻底删除 / 过期自动清理。
 * <p>
 * 删除设计见 {@link FileService#deleteFile} / {@link FileService#deleteDirectory}：
 * <ul>
 *   <li>文件软删：仅标记 deleted_at，path 不动（files 无 path 唯一约束）</li>
 *   <li>目录软删：整棵子树 path/parent_path 迁移到 {@code __trash/{dirId}/} 前缀下，
 *       释放原路径（directories 有 UNIQUE (user_id, path)），恢复时按前缀还原</li>
 *   <li>配额在软删期间保持占用，彻底删除时才回退</li>
 *   <li>顶层判定：目录 parent_path / 文件 path 带 {@code __trash/} 前缀的为子孙，
 *       随顶层一起展示与恢复，不在废纸篓中单列</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TrashService {

    /** 废纸篓路径前缀：目录软删时子树 path 迁移到 __trash/{dirId}/ 下（该目录名为保留名，用户不可创建） */
    public static final String TRASH_PREFIX = "__trash/";

    /** 废纸篓保留期（天）：超期由定时任务自动彻底删除 */
    private static final int RETENTION_DAYS = 30;

    private final FileRepository fileRepository;
    private final DirectoryRepository directoryRepository;
    private final FileShareLinkRepository fileShareLinkRepository;
    private final UserRepository userRepository;
    private final StorageService storageService;

    // ==================== 查询 ====================

    /**
     * 废纸篓列表：顶层文件 + 顶层目录（删除时间倒序）
     */
    @Transactional(readOnly = true)
    public TrashViewDTO list(Long userId) {
        List<TrashItemDTO> files = fileRepository.findDeletedTopByUserId(userId).stream()
                .map(f -> new TrashItemDTO(f.getId(), "file", f.getFileName(),
                        f.getPath(), f.getSizeBytes(), f.getMimeType(), f.getDeletedAt()))
                .toList();

        List<TrashItemDTO> directories = directoryRepository.findDeletedTopByUserId(userId).stream()
                .map(d -> new TrashItemDTO(d.getId(), "directory", d.getName(),
                        d.getParentPath(), null, null, d.getDeletedAt()))
                .toList();

        return new TrashViewDTO(files, directories);
    }

    // ==================== 恢复 ====================

    /**
     * 恢复文件到原位置
     *
     * @throws BusinessException 文件不在废纸篓 / 所在目录在废纸篓 / 原目录已不存在 / 原位置同名冲突
     */
    @Transactional
    public void restoreFile(Long userId, Long fileId) {
        FileEntity file = fileRepository.findDeletedById(userId, fileId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FILE_NOT_FOUND, "文件不在废纸篓中", 404));

        String path = file.getPath();
        if (path.startsWith(TRASH_PREFIX)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "所在目录也在废纸篓中，请先恢复所在目录", 409);
        }
        if (!path.isBlank() && !directoryRepository.existsByUserIdAndPath(userId, path)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "原目录已不存在，无法恢复", 404);
        }
        if (fileRepository.existsByUserIdAndPathAndFileName(userId, path, file.getFileName())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "原位置已存在同名文件", 409);
        }

        fileRepository.restoreById(userId, fileId);
        log.info("File restored from trash: userId={}, fileId={}, path={}", userId, fileId, path);
    }

    /**
     * 恢复目录整棵子树到原位置
     *
     * @throws BusinessException 目录不在废纸篓 / 原位置不存在 / 原位置同名冲突
     */
    @Transactional
    public void restoreDirectory(Long userId, Long dirId) {
        DirectoryEntity dir = directoryRepository.findDeletedById(userId, dirId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FILE_NOT_FOUND, "目录不在废纸篓中", 404));

        // 顶层目录的 path 必为 __trash/{dirId}/{origPath}
        String prefixedPath = dir.getPath();
        int idx = prefixedPath.indexOf('/', TRASH_PREFIX.length());
        if (!prefixedPath.startsWith(TRASH_PREFIX) || idx < 0) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "废纸篓数据异常，无法恢复", 500);
        }
        String trashPrefix = prefixedPath.substring(0, idx + 1);
        String origPath = prefixedPath.substring(trashPrefix.length());

        String parentPath = dir.getParentPath();
        if (!parentPath.isBlank() && !directoryRepository.existsByUserIdAndPath(userId, parentPath)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "原位置已不存在，无法恢复", 404);
        }
        if (directoryRepository.existsByUserIdAndPath(userId, origPath)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "原位置已存在同名目录", 409);
        }

        int prefixLen = trashPrefix.length() + 1; // SUBSTRING 为 1-based，去掉长度 L 的前缀需从 L+1 开始
        directoryRepository.restoreSelf(userId, dirId, prefixLen);
        directoryRepository.restoreSubDirs(userId, prefixedPath, prefixLen);
        fileRepository.restoreByTrashPathPrefix(userId, prefixedPath, prefixLen);

        log.info("Directory restored from trash: userId={}, dirId={}, origPath={}", userId, dirId, origPath);
    }

    // ==================== 彻底删除 ====================

    /**
     * 彻底删除废纸篓中的单个文件：物理删除 + 回退配额 + 清理 COS
     */
    @Transactional
    public void purgeFile(Long userId, Long fileId) {
        FileEntity file = fileRepository.findDeletedById(userId, fileId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FILE_NOT_FOUND, "文件不在废纸篓中", 404));

        fileShareLinkRepository.deleteByFileId(fileId);
        fileRepository.deleteHardById(userId, fileId);
        userRepository.decrementStorageUsed(userId, file.getSizeBytes());
        deleteCosObjects(List.of(file.getCosKey()));

        log.info("File purged from trash: userId={}, fileId={}, size={}", userId, fileId, file.getSizeBytes());
    }

    /**
     * 彻底删除废纸篓中的目录整棵子树：物理删除 + 回退配额 + 清理 COS
     */
    @Transactional
    public void purgeDirectory(Long userId, Long dirId) {
        DirectoryEntity dir = directoryRepository.findDeletedById(userId, dirId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FILE_NOT_FOUND, "目录不在废纸篓中", 404));

        String prefixedPath = dir.getPath();

        // 子树内已删文件的分享链接清理
        List<Long> fileIds = fileRepository.findDeletedByPathPrefix(userId, prefixedPath)
                .stream().map(FileEntity::getId).toList();
        if (!fileIds.isEmpty()) {
            fileShareLinkRepository.deleteByFileIdIn(fileIds);
        }

        long totalSize = fileRepository.sumDeletedSizeByPathPrefix(userId, prefixedPath);
        List<String> cosKeys = fileRepository.findDeletedCosKeysByPathPrefix(userId, prefixedPath);

        // 物理删除（bulk delete 不受 @SQLRestriction 影响，覆盖整个已删子树）
        fileRepository.deleteByUserIdAndPathPrefix(userId, prefixedPath);
        directoryRepository.deleteByUserIdAndPathPrefix(userId, prefixedPath);

        if (totalSize > 0) {
            userRepository.decrementStorageUsed(userId, totalSize);
        }
        deleteCosObjects(cosKeys);

        log.info("Directory purged from trash: userId={}, dirId={}, trashPath={}, sizeFreed={}",
                userId, dirId, prefixedPath, totalSize);
    }

    /**
     * 清空废纸篓：物理删除用户全部已删除项
     */
    @Transactional
    public void purgeAll(Long userId) {
        List<FileEntity> deletedFiles = fileRepository.findDeletedByUserId(userId);

        List<Long> fileIds = deletedFiles.stream().map(FileEntity::getId).toList();
        if (!fileIds.isEmpty()) {
            fileShareLinkRepository.deleteByFileIdIn(fileIds);
        }

        long totalSize = fileRepository.sumDeletedSizeByUserId(userId);
        List<String> cosKeys = fileRepository.findDeletedCosKeysByUserId(userId);

        fileRepository.deleteAllDeletedByUserId(userId);
        directoryRepository.deleteAllDeletedByUserId(userId);

        if (totalSize > 0) {
            userRepository.decrementStorageUsed(userId, totalSize);
        }
        deleteCosObjects(cosKeys);

        log.info("Trash emptied: userId={}, files={}, sizeFreed={}", userId, fileIds.size(), totalSize);
    }

    // ==================== 过期自动清理 ====================

    /**
     * 定时清理超过保留期的废纸篓项（默认每天 03:30，miao.storage.trash-cleanup.cron 可配）
     * <p>
     * 目录与其子树文件删除时间一致，会同时过期；bulk delete 全表按 deleted_at 过滤，
     * 目录/文件各自一次性物理删除，配额按用户分组回退，COS 对象批量清理。
     */
    @Scheduled(cron = "${miao.storage.trash-cleanup.cron:0 30 3 * * ?}")
    @Transactional
    public void purgeExpired() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(RETENTION_DAYS);

        List<Long> expiredFileIds = fileRepository.findExpiredBefore(cutoff)
                .stream().map(FileEntity::getId).toList();
        if (!expiredFileIds.isEmpty()) {
            fileShareLinkRepository.deleteByFileIdIn(expiredFileIds);
        }

        List<String> cosKeys = new ArrayList<>(fileRepository.findExpiredCosKeys(cutoff));
        List<Object[]> sizeByUser = fileRepository.sumExpiredSizeGroupByUser(cutoff);

        int fileCount = fileRepository.deleteAllExpiredBefore(cutoff);
        int dirCount = directoryRepository.deleteAllExpiredBefore(cutoff);

        for (Object[] row : sizeByUser) {
            long userId = ((Number) row[0]).longValue();
            long size = ((Number) row[1]).longValue();
            if (size > 0) {
                userRepository.decrementStorageUsed(userId, size);
            }
        }

        if (fileCount > 0 || dirCount > 0) {
            log.info("Trash retention cleanup: cutoff={}, filesPurged={}, dirsPurged={}",
                    cutoff, fileCount, dirCount);
        }

        // COS 删除放在 DB 之后：失败仅残留孤立对象，由 OrphanFileCleanupJob 兜底
        deleteCosObjects(cosKeys);
    }

    // ==================== 内部工具 ====================

    private void deleteCosObjects(List<String> cosKeys) {
        for (String cosKey : cosKeys) {
            try {
                storageService.deleteObject(cosKey);
            } catch (Exception e) {
                log.error("COS 对象删除失败，残留为孤立文件待清理: cosKey={}, error={}", cosKey, e.getMessage());
            }
        }
    }
}
