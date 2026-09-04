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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

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

            FileService.BatchResult result = fileService.batchMoveFiles(USER_ID, List.of(FILE_A, FILE_B), "docs");

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

            FileService.BatchResult result = fileService.batchMoveFiles(USER_ID, List.of(FILE_A), "");

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

            assertThatThrownBy(() -> fileService.batchMoveFiles(USER_ID, List.of(FILE_A, FILE_B), "nope"))
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

            assertThatThrownBy(() -> fileService.batchMoveFiles(USER_ID, List.of(FILE_A, FILE_FOREIGN), "docs"))
                    .isInstanceOf(StorageException.class)
                    .extracting("code")
                    .isEqualTo("FILE_NOT_FOUND");

            verify(fileRepository, never()).save(any(FileEntity.class));
        }

        @Test
        @DisplayName("空列表：返回 VALIDATION_FAILED")
        void batchMove_emptyList_rejected() {
            assertThatThrownBy(() -> fileService.batchMoveFiles(USER_ID, List.of(), "docs"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(ErrorCode.VALIDATION_FAILED);
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
