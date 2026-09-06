package com.miao.toolbox.storage.service;

import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.notification.service.NotificationService;
import com.miao.toolbox.storage.config.StorageProperties;
import com.miao.toolbox.storage.entity.DirectoryEntity;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.repository.DirectoryRepository;
import com.miao.toolbox.storage.repository.FileRepository;
import com.miao.toolbox.storage.repository.FileShareLinkRepository;
import com.miao.toolbox.storage.repository.FileShareRepository;
import com.miao.toolbox.storage.validator.FileNameValidator;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Story 5.6 单元测试：cos_key 解耦 + 目录重命名/移动
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("FileService cos_key 解耦与目录操作单元测试")
class FileServiceDirectoryTest {

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
    private static final Long DIR_ID = 10L;

    @BeforeEach
    void setUp() {
        fileService = new FileService(
                fileRepository, directoryRepository, fileShareRepository, fileShareLinkRepository,
                userRepository, storageService, storageProperties, fileNameValidator, notificationService
        );
    }

    private DirectoryEntity dir(Long id, String name, String path, String parentPath) {
        return DirectoryEntity.builder()
                .id(id).userId(USER_ID).name(name).path(path).parentPath(parentPath)
                .createdAt(LocalDateTime.now())
                .build();
    }

    private FileEntity file(Long id, String name, String path, String cosKey) {
        return FileEntity.builder()
                .id(id).userId(USER_ID).fileName(name).path(path).cosKey(cosKey)
                .sizeBytes(100L).mimeType("text/plain")
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now())
                .build();
    }

    // ==================== AC-1: cos_key 解耦 ====================

    @Nested
    @DisplayName("AC-1: moveFile / renameFile 不再调用 COS")
    class CosKeyDecouple {

        @Test
        @DisplayName("moveFile：纯 DB 更新 path，无 copyObject / deleteObject / buildKey")
        void moveFile_noCosCall() {
            FileEntity f = file(100L, "a.txt", "", "1/a.txt");
            when(fileRepository.findById(100L)).thenReturn(Optional.of(f));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs")).thenReturn(true);
            when(fileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            fileService.moveFile(USER_ID, 100L, "docs");

            assertThat(f.getPath()).isEqualTo("docs");
            // cos_key 不变
            assertThat(f.getCosKey()).isEqualTo("1/a.txt");
            verify(storageService, never()).copyObject(anyString(), anyString());
            verify(storageService, never()).deleteObject(anyString());
            verify(storageService, never()).buildKey(anyLong(), anyString(), anyString());
        }

        @Test
        @DisplayName("renameFile：纯 DB 更新 fileName，无 COS 调用")
        void renameFile_noCosCall() {
            FileEntity f = file(100L, "a.txt", "", "1/a.txt");
            when(fileRepository.findById(100L)).thenReturn(Optional.of(f));
            lenient().when(fileShareRepository.findByFileId(100L)).thenReturn(List.of());
            when(fileNameValidator.validate("b.txt")).thenReturn("b.txt");
            when(fileRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            fileService.renameFile(USER_ID, 100L, "b.txt");

            assertThat(f.getFileName()).isEqualTo("b.txt");
            assertThat(f.getCosKey()).isEqualTo("1/a.txt");
            verify(storageService, never()).copyObject(anyString(), anyString());
            verify(storageService, never()).deleteObject(anyString());
        }
    }

    // ==================== AC-2: 目录重命名 ====================

    @Nested
    @DisplayName("AC-2: 目录重命名级联")
    class DirectoryRename {

        @Test
        @DisplayName("重命名根目录下目录：自身 path 更新 + 级联委托给 bulk update（覆盖含软删子树）")
        void renameRootDir_cascadeChildren() {
            DirectoryEntity docs = dir(DIR_ID, "docs", "docs", "");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(docs));
            when(fileNameValidator.validateDirectoryName("archive")).thenReturn("archive");
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "archive")).thenReturn(false);

            DirectoryEntity result = fileService.renameDirectory(USER_ID, DIR_ID, "archive");

            assertThat(result.getName()).isEqualTo("archive");
            assertThat(result.getPath()).isEqualTo("archive");
            // V32：级联改为 bulk update（@SQLRestriction 会过滤掉废纸篓中的子孙，
            // 逐实体 save 会漏改已删项路径），此处验证委托参数正确
            verify(directoryRepository).cascadePathPrefix(USER_ID, "docs", "archive");
            verify(fileRepository).cascadePathPrefix(USER_ID, "docs", "archive");
            // 无 COS 调用
            verify(storageService, never()).copyObject(anyString(), anyString());
        }

        @Test
        @DisplayName("重命名深层目录：parentPath 保留，path 前缀替换")
        void renameDeepDir_cascadePrefix() {
            DirectoryEntity subDir = dir(DIR_ID, "sub", "docs/sub", "docs");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(subDir));
            when(fileNameValidator.validateDirectoryName("renamed")).thenReturn("renamed");
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs/renamed")).thenReturn(false);

            fileService.renameDirectory(USER_ID, DIR_ID, "renamed");

            assertThat(subDir.getPath()).isEqualTo("docs/renamed");
            assertThat(subDir.getParentPath()).isEqualTo("docs");
            verify(directoryRepository).cascadePathPrefix(USER_ID, "docs/sub", "docs/renamed");
            verify(fileRepository).cascadePathPrefix(USER_ID, "docs/sub", "docs/renamed");
        }

        @Test
        @DisplayName("同名目录已存在：返回 409")
        void rename_targetExists_409() {
            DirectoryEntity docs = dir(DIR_ID, "docs", "docs", "");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(docs));
            when(fileNameValidator.validateDirectoryName("existing")).thenReturn("existing");
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "existing")).thenReturn(true);

            assertThatThrownBy(() -> fileService.renameDirectory(USER_ID, DIR_ID, "existing"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(com.miao.toolbox.common.constant.ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("目录不存在：返回 404")
        void rename_dirNotFound_404() {
            when(directoryRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> fileService.renameDirectory(USER_ID, 999L, "new"))
                    .isInstanceOf(BusinessException.class);
        }
    }

    // ==================== AC-3: 目录移动 ====================

    @Nested
    @DisplayName("AC-3: 目录移动 + 防循环")
    class DirectoryMove {

        @Test
        @DisplayName("移动到根目录：path 更新 + 子内容级联委托 bulk update")
        void moveToRoot_cascade() {
            DirectoryEntity subDir = dir(DIR_ID, "sub", "docs/sub", "docs");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(subDir));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "sub")).thenReturn(false);

            DirectoryEntity result = fileService.moveDirectory(USER_ID, DIR_ID, "");

            assertThat(result.getPath()).isEqualTo("sub");
            assertThat(result.getParentPath()).isEqualTo("");
            verify(directoryRepository).cascadePathPrefix(USER_ID, "docs/sub", "sub");
            verify(fileRepository).cascadePathPrefix(USER_ID, "docs/sub", "sub");
        }

        @Test
        @DisplayName("移动到另一目录：path 更新 + parentPath 更新")
        void moveToAnotherDir_cascade() {
            DirectoryEntity subDir = dir(DIR_ID, "sub", "docs/sub", "docs");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(subDir));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "archive")).thenReturn(true);
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "archive/sub")).thenReturn(false);

            DirectoryEntity result = fileService.moveDirectory(USER_ID, DIR_ID, "archive");

            assertThat(result.getPath()).isEqualTo("archive/sub");
            assertThat(result.getParentPath()).isEqualTo("archive");
            verify(directoryRepository).cascadePathPrefix(USER_ID, "docs/sub", "archive/sub");
            verify(fileRepository).cascadePathPrefix(USER_ID, "docs/sub", "archive/sub");
        }

        @Test
        @DisplayName("防循环：移动到自身 → 拒绝")
        void move_toSelf_rejected() {
            DirectoryEntity docs = dir(DIR_ID, "docs", "docs", "");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(docs));

            assertThatThrownBy(() -> fileService.moveDirectory(USER_ID, DIR_ID, "docs"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(com.miao.toolbox.common.constant.ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("防循环：移动到自身子目录 → 拒绝")
        void move_toChild_rejected() {
            DirectoryEntity docs = dir(DIR_ID, "docs", "docs", "");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(docs));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "docs/sub")).thenReturn(true);

            assertThatThrownBy(() -> fileService.moveDirectory(USER_ID, DIR_ID, "docs/sub"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode")
                    .isEqualTo(com.miao.toolbox.common.constant.ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("目标父目录不存在 → 拒绝")
        void move_targetParentMissing_rejected() {
            DirectoryEntity docs = dir(DIR_ID, "docs", "docs", "");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(docs));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "nope")).thenReturn(false);

            assertThatThrownBy(() -> fileService.moveDirectory(USER_ID, DIR_ID, "nope"))
                    .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("同名目录已存在 → 409")
        void move_targetExists_409() {
            DirectoryEntity subDir = dir(DIR_ID, "sub", "docs/sub", "docs");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(subDir));
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "archive")).thenReturn(true);
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "archive/sub")).thenReturn(true);

            assertThatThrownBy(() -> fileService.moveDirectory(USER_ID, DIR_ID, "archive"))
                    .isInstanceOf(BusinessException.class);
        }
    }

    // ==================== 前缀匹配安全性 ====================

    @Nested
    @DisplayName("前缀匹配不误伤同名兄弟目录")
    class PrefixSafety {

        @Test
        @DisplayName("重命名 docs → archive：级联范围仅限 docs/ 前缀，docs-backup 天然不匹配")
        void rename_doesNotAffectSibling() {
            DirectoryEntity docs = dir(DIR_ID, "docs", "docs", "");
            when(directoryRepository.findById(DIR_ID)).thenReturn(Optional.of(docs));
            when(fileNameValidator.validateDirectoryName("archive")).thenReturn("archive");
            when(directoryRepository.existsByUserIdAndPath(USER_ID, "archive")).thenReturn(false);

            fileService.renameDirectory(USER_ID, DIR_ID, "archive");

            // bulk update 的 WHERE path LIKE 'docs/%' 只命中 docs 子树，
            // docs-backup（docs-backup 不以 docs/ 开头）天然不受影响
            verify(directoryRepository).cascadePathPrefix(USER_ID, "docs", "archive");
            verify(fileRepository).cascadePathPrefix(USER_ID, "docs", "archive");
        }
    }
}
