package com.miao.toolbox.storage.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.notification.service.NotificationService;
import com.miao.toolbox.storage.config.StorageProperties;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.exception.StorageException;
import com.miao.toolbox.storage.repository.DirectoryRepository;
import com.miao.toolbox.storage.repository.FileRepository;
import com.miao.toolbox.storage.repository.FileShareLinkRepository;
import com.miao.toolbox.storage.repository.FileShareRepository;
import com.miao.toolbox.storage.validator.FileNameValidator;
import com.miao.toolbox.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("FileService 批量操作单元测试")
class FileServiceBatchTest {

    @Mock private FileRepository fileRepository;
    @Mock private DirectoryRepository directoryRepository;
    @Mock private FileShareRepository fileShareRepository;
    @Mock private FileShareLinkRepository fileShareLinkRepository;
    @Mock private UserRepository userRepository;
    @Mock private StorageService storageService;
    @Mock private StorageProperties storageProperties;
    @Mock private FileNameValidator fileNameValidator;
    @Mock private NotificationService notificationService;

    private FileService fileService;

    private static final Long USER_ID = 1L;
    private static final Long FILE_A = 100L;
    private static final Long FILE_B = 101L;
    private static final Long FILE_FOREIGN = 999L;

    private FileEntity fileA;
    private FileEntity fileB;

    @BeforeEach
    void setUp() {
        fileService = new FileService(
                fileRepository, directoryRepository, fileShareRepository, fileShareLinkRepository,
                userRepository, storageService, storageProperties, fileNameValidator, notificationService
        );

        fileA = file(FILE_A, "a.txt", "", 1024L);
        fileB = file(FILE_B, "b.txt", "", 2048L);
    }

    private FileEntity file(Long id, String name, String path, long size) {
        return FileEntity.builder()
                .id(id)
                .userId(USER_ID)
                .fileName(name)
                .path(path)
                .cosKey(USER_ID + "/" + (path.isEmpty() ? "" : path + "/") + name)
                .sizeBytes(size)
                .mimeType("text/plain")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    // ==================== batchDeleteFiles ====================

    @Nested
    @DisplayName("batchDeleteFiles - 批量删除")
    class BatchDeleteTests {

        @Test
        @DisplayName("全部属于自己：单事务删除全部，配额原子释放，返回 success 列表")
        void batchDelete_success() {
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(fileRepository.findById(FILE_B)).thenReturn(Optional.of(fileB));

            FileService.BatchResult result = fileService.batchDeleteFiles(USER_ID, List.of(FILE_A, FILE_B));

            assertThat(result.success()).containsExactlyInAnyOrder(FILE_A, FILE_B);
            assertThat(result.failed()).isEmpty();
            verify(fileShareLinkRepository).deleteByFileId(FILE_A);
            verify(fileShareLinkRepository).deleteByFileId(FILE_B);
            verify(fileRepository).delete(fileA);
            verify(fileRepository).delete(fileB);
            // 配额按总量一次性原子释放：1024 + 2048 = 3072
            verify(userRepository).decrementStorageUsed(USER_ID, 3072L);
            verify(storageService).deleteObject(fileA.getCosKey());
            verify(storageService).deleteObject(fileB.getCosKey());
        }

        @Test
        @DisplayName("部分文件不属于自己：整批拒绝，不删除任何文件")
        void batchDelete_partialForeign_rejectAll() {
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(fileRepository.findById(FILE_FOREIGN)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> fileService.batchDeleteFiles(USER_ID, List.of(FILE_A, FILE_FOREIGN)))
                    .isInstanceOf(StorageException.class)
                    .extracting("code")
                    .isEqualTo("FILE_NOT_FOUND");

            verify(fileRepository, never()).delete(any(FileEntity.class));
            verify(userRepository, never()).decrementStorageUsed(anyLong(), anyLong());
            verify(storageService, never()).deleteObject(anyString());
        }

        @Test
        @DisplayName("空列表：返回 VALIDATION_FAILED")
        void batchDelete_emptyList_rejected() {
            assertThatThrownBy(() -> fileService.batchDeleteFiles(USER_ID, List.of()))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(ErrorCode.VALIDATION_FAILED);

            verify(fileRepository, never()).delete(any(FileEntity.class));
        }

        @Test
        @DisplayName("null 列表：返回 VALIDATION_FAILED")
        void batchDelete_nullList_rejected() {
            assertThatThrownBy(() -> fileService.batchDeleteFiles(USER_ID, null))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("COS 删除失败不影响整体：仅记录日志，DB 删除已生效")
        void batchDelete_cosFailure_continues() {
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(fileRepository.findById(FILE_B)).thenReturn(Optional.of(fileB));
            doThrow(new RuntimeException("COS unavailable"))
                    .when(storageService).deleteObject(fileA.getCosKey());

            FileService.BatchResult result = fileService.batchDeleteFiles(USER_ID, List.of(FILE_A, FILE_B));

            assertThat(result.success()).containsExactlyInAnyOrder(FILE_A, FILE_B);
            verify(fileRepository).delete(fileA);
            verify(fileRepository).delete(fileB);
            verify(userRepository).decrementStorageUsed(USER_ID, 3072L);
        }
    }

    // ==================== batchMoveFiles ====================

    @Nested
    @DisplayName("batchMoveFiles - 批量移动")
    class BatchMoveTests {

        @Test
        @DisplayName("全部属于自己且目标目录存在：单事务移动全部，返回 success 列表")
        void batchMove_success() {
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(fileRepository.findById(FILE_B)).thenReturn(Optional.of(fileB));

            FileService.BatchResult result = fileService.batchMoveFiles(USER_ID, List.of(FILE_A, FILE_B), "docs", null);

            assertThat(result.success()).containsExactlyInAnyOrder(FILE_A, FILE_B);
            assertThat(result.failed()).isEmpty();
            verify(fileRepository).save(fileA);
            verify(fileRepository).save(fileB);
            assertThat(fileA.getPath()).isEqualTo("docs");
            assertThat(fileB.getPath()).isEqualTo("docs");
            // FR-27（Story 5.6）：cos_key 不再变更，无 COS 调用
            verify(storageService, never()).copyObject(anyString(), anyString());
            verify(storageService, never()).deleteObject(anyString());
        }

        @Test
        @DisplayName("移动到根目录：targetPath 为空时不校验目录存在性")
        void batchMove_toRoot_success() {
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));

            FileService.BatchResult result = fileService.batchMoveFiles(USER_ID, List.of(FILE_A), "", null);

            assertThat(result.success()).containsExactly(FILE_A);
            verify(directoryRepository, never()).existsByUserIdAndPath(anyLong(), anyString());
            assertThat(fileA.getPath()).isEmpty();
            // FR-27：无 COS 调用
            verify(storageService, never()).copyObject(anyString(), anyString());
        }

        @Test
        @DisplayName("目标目录不存在：整批拒绝")
        void batchMove_targetDirMissing_rejected() {
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "nope")).thenReturn(false);

            assertThatThrownBy(() -> fileService.batchMoveFiles(USER_ID, List.of(FILE_A, FILE_B), "nope", null))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(ErrorCode.VALIDATION_FAILED);

            verify(fileRepository, never()).save(any(FileEntity.class));
        }

        @Test
        @DisplayName("部分文件不属于自己：整批拒绝，不移动任何文件")
        void batchMove_partialForeign_rejectAll() {
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(fileRepository.findById(FILE_FOREIGN)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> fileService.batchMoveFiles(USER_ID, List.of(FILE_A, FILE_FOREIGN), "docs", null))
                    .isInstanceOf(StorageException.class)
                    .extracting("code")
                    .isEqualTo("FILE_NOT_FOUND");

            verify(fileRepository, never()).save(any(FileEntity.class));
        }

        @Test
        @DisplayName("空列表：返回 VALIDATION_FAILED")
        void batchMove_emptyList_rejected() {
            assertThatThrownBy(() -> fileService.batchMoveFiles(USER_ID, List.of(), "docs", null))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("keepBoth 策略：目标目录同名时移动后自动追加序号")
        void batchMove_keepBoth_renames() {
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            // 目标目录已有同名 a.txt（非自身）
            FileEntity existing = file(200L, "a.txt", "docs", 512L);
            when(fileRepository.findByUserIdAndPathAndFileName(USER_ID, "docs", "a.txt"))
                    .thenReturn(List.of(existing));
            when(fileRepository.findByUserIdAndPathAndFileName(USER_ID, "docs", "a (1).txt"))
                    .thenReturn(List.of());

            fileService.batchMoveFiles(USER_ID, List.of(FILE_A), "docs", "keepBoth");

            assertThat(fileA.getPath()).isEqualTo("docs");
            assertThat(fileA.getFileName()).isEqualTo("a (1).txt");
            // keepBoth 不删任何东西
            verify(fileRepository, never()).deleteAll(anyList());
            verify(storageService, never()).deleteObject(anyString());
        }

        @Test
        @DisplayName("replace 策略：删除目标目录同名旧记录 + COS 对象 + 退还配额，再移入")
        void batchMove_replace_removesOld() {
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            FileEntity existing = file(200L, "a.txt", "docs", 512L);
            when(fileRepository.findByUserIdAndPathAndFileName(USER_ID, "docs", "a.txt"))
                    .thenReturn(List.of(existing));

            fileService.batchMoveFiles(USER_ID, List.of(FILE_A), "docs", "replace");

            verify(fileRepository).deleteAll(List.of(existing));
            verify(userRepository).decrementStorageUsed(USER_ID, 512L);
            verify(storageService).deleteObject(existing.getCosKey());
            assertThat(fileA.getPath()).isEqualTo("docs");
            assertThat(fileA.getFileName()).isEqualTo("a.txt");
        }
    }

    // ==================== batchCopyFiles ====================

    @Nested
    @DisplayName("batchCopyFiles - 批量复制（Story 5.10 剪贴板粘贴）")
    class BatchCopyTests {

        private User userWithQuota(long used, long quota) {
            User u = new User();
            u.setId(USER_ID);
            u.setUsername("tester");
            u.setStorageUsedBytes(used);
            u.setStorageQuotaBytes(quota);
            return u;
        }

        /** 模拟 JPA 保存后回填自增主键 */
        private void stubSaveWithIds() {
            AtomicInteger seq = new AtomicInteger(900);
            when(fileRepository.save(any(FileEntity.class))).thenAnswer(inv -> {
                FileEntity f = inv.getArgument(0);
                f.setId((long) seq.incrementAndGet());
                return f;
            });
        }

        @Test
        @DisplayName("复制两个文件：COS 对象逐个复制、配额按总量扣减、customOrder 从目录末尾追加")
        void batchCopy_success() {
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(fileRepository.findById(FILE_B)).thenReturn(Optional.of(fileB));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(userWithQuota(0L, 1073741824L)));
            when(fileRepository.findMaxCustomOrder(USER_ID, "docs")).thenReturn(5);
            when(fileRepository.findByUserIdAndPathAndFileName(anyLong(), anyString(), anyString()))
                    .thenReturn(List.of());
            when(storageService.buildKey(eq(USER_ID), eq("docs"), anyString()))
                    .thenAnswer(inv -> "1/docs/" + inv.getArgument(2));
            when(userRepository.incrementStorageUsedWithQuotaCheck(USER_ID, 3072L)).thenReturn(1);
            stubSaveWithIds();

            FileService.BatchResult result = fileService.batchCopyFiles(USER_ID, List.of(FILE_A, FILE_B), "docs");

            assertThat(result.success()).hasSize(2);
            assertThat(result.failed()).isEmpty();
            // 每个源文件真实复制一份 COS 对象（区别于移动的纯元数据更新）
            verify(storageService).copyObject(fileA.getCosKey(), "1/docs/a.txt");
            verify(storageService).copyObject(fileB.getCosKey(), "1/docs/b.txt");
            // 配额按总量一次性扣减：1024 + 2048
            verify(userRepository).incrementStorageUsedWithQuotaCheck(USER_ID, 3072L);

            ArgumentCaptor<FileEntity> captor = ArgumentCaptor.forClass(FileEntity.class);
            verify(fileRepository, times(2)).save(captor.capture());
            assertThat(captor.getAllValues())
                    .extracting(FileEntity::getFileName)
                    .containsExactly("a.txt", "b.txt");
            assertThat(captor.getAllValues())
                    .extracting(FileEntity::getPath)
                    .containsExactly("docs", "docs");
            // 目标目录末尾 customOrder 为 5，依次追加 6、7
            assertThat(captor.getAllValues())
                    .extracting(FileEntity::getCustomOrder)
                    .containsExactly(6, 7);
        }

        @Test
        @DisplayName("目标目录已存在同名文件：自动追加 \" (1)\" 序号")
        void batchCopy_nameConflict_appendsSuffix() {
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(userWithQuota(0L, 1073741824L)));
            when(fileRepository.findMaxCustomOrder(USER_ID, "docs")).thenReturn(0);
            // a.txt 已被占用，a (1).txt 空闲
            when(fileRepository.findByUserIdAndPathAndFileName(USER_ID, "docs", "a.txt"))
                    .thenReturn(List.of(fileA));
            when(fileRepository.findByUserIdAndPathAndFileName(USER_ID, "docs", "a (1).txt"))
                    .thenReturn(List.of());
            when(storageService.buildKey(eq(USER_ID), eq("docs"), anyString()))
                    .thenAnswer(inv -> "1/docs/" + inv.getArgument(2));
            when(userRepository.incrementStorageUsedWithQuotaCheck(USER_ID, 1024L)).thenReturn(1);
            stubSaveWithIds();

            fileService.batchCopyFiles(USER_ID, List.of(FILE_A), "docs");

            ArgumentCaptor<FileEntity> captor = ArgumentCaptor.forClass(FileEntity.class);
            verify(fileRepository).save(captor.capture());
            assertThat(captor.getValue().getFileName()).isEqualTo("a (1).txt");
        }

        @Test
        @DisplayName("配额不足：整批拒绝，不复制任何 COS 对象")
        void batchCopy_quotaExceeded_rejectAll() {
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            // 已用 3000，配额 3072，再复制 1024 会超限
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(userWithQuota(3000L, 3072L)));

            assertThatThrownBy(() -> fileService.batchCopyFiles(USER_ID, List.of(FILE_A), "docs"))
                    .isInstanceOf(StorageException.class);

            verify(storageService, never()).copyObject(anyString(), anyString());
            verify(fileRepository, never()).save(any(FileEntity.class));
        }

        @Test
        @DisplayName("目标目录不存在：拒绝并报 VALIDATION_FAILED")
        void batchCopy_missingTargetDir_rejected() {
            // 目标目录校验早于文件归属校验，因此此处不需要 stub findById
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "nope")).thenReturn(false);

            assertThatThrownBy(() -> fileService.batchCopyFiles(USER_ID, List.of(FILE_A), "nope"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(ErrorCode.VALIDATION_FAILED);

            verify(storageService, never()).copyObject(anyString(), anyString());
        }

        @Test
        @DisplayName("含他人文件：整批拒绝，不复制任何文件")
        void batchCopy_foreignFile_rejectAll() {
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(fileRepository.findById(FILE_FOREIGN)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> fileService.batchCopyFiles(USER_ID, List.of(FILE_A, FILE_FOREIGN), "docs"))
                    .isInstanceOf(StorageException.class);

            verify(storageService, never()).copyObject(anyString(), anyString());
            verify(fileRepository, never()).save(any(FileEntity.class));
        }

        @Test
        @DisplayName("COS 复制中途失败：补偿删除已复制的对象，避免产生孤儿对象")
        void batchCopy_cosFailure_compensates() {
            when(fileRepository.findById(FILE_A)).thenReturn(Optional.of(fileA));
            when(fileRepository.findById(FILE_B)).thenReturn(Optional.of(fileB));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(userWithQuota(0L, 1073741824L)));
            when(fileRepository.findMaxCustomOrder(USER_ID, "docs")).thenReturn(0);
            when(fileRepository.findByUserIdAndPathAndFileName(anyLong(), anyString(), anyString()))
                    .thenReturn(List.of());
            when(storageService.buildKey(eq(USER_ID), eq("docs"), anyString()))
                    .thenAnswer(inv -> "1/docs/" + inv.getArgument(2));
            // 第一个文件复制正常，复制第二个文件时 COS 故障
            doNothing().when(storageService).copyObject(fileA.getCosKey(), "1/docs/a.txt");
            doThrow(new RuntimeException("COS unavailable"))
                    .when(storageService).copyObject(fileB.getCosKey(), "1/docs/b.txt");
            stubSaveWithIds();

            assertThatThrownBy(() -> fileService.batchCopyFiles(USER_ID, List.of(FILE_A, FILE_B), "docs"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("COS unavailable");

            // 已复制成功的第一个对象被补偿删除（DB 部分由事务回滚）
            verify(storageService).deleteObject("1/docs/a.txt");
        }

        @Test
        @DisplayName("空列表：返回 VALIDATION_FAILED")
        void batchCopy_emptyList_rejected() {
            assertThatThrownBy(() -> fileService.batchCopyFiles(USER_ID, List.of(), "docs"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(ErrorCode.VALIDATION_FAILED);

            verify(storageService, never()).copyObject(anyString(), anyString());
        }
    }

    // 供 mock User 使用（batch 场景未直接用到，保留以对齐既有测试风格）
    @SuppressWarnings("unused")
    private User mockUser(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }
}
