package com.miao.toolbox.storage.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.storage.dto.FileInfoDTO;
import com.miao.toolbox.storage.dto.ShareDTO;
import com.miao.toolbox.storage.dto.SharedWithMeDTO;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.entity.FileShareEntity;
import com.miao.toolbox.storage.repository.DirectoryRepository;
import com.miao.toolbox.storage.repository.FileRepository;
import com.miao.toolbox.storage.repository.FileShareRepository;
import com.miao.toolbox.storage.config.StorageProperties;
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
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("FileService 共享功能单元测试")
class FileServiceShareTest {

    @Mock private FileRepository fileRepository;
    @Mock private DirectoryRepository directoryRepository;
    @Mock private FileShareRepository fileShareRepository;
    @Mock private UserRepository userRepository;
    @Mock private StorageService storageService;
    @Mock private StorageProperties storageProperties;
    @Mock private FileNameValidator fileNameValidator;

    private FileService fileService;

    private static final Long OWNER_ID = 1L;
    private static final Long OTHER_USER_ID = 2L;
    private static final Long FILE_ID = 100L;

    private FileEntity ownerFile;

    @BeforeEach
    void setUp() {
        fileService = new FileService(
                fileRepository, directoryRepository, fileShareRepository,
                userRepository, storageService, storageProperties, fileNameValidator
        );

        ownerFile = FileEntity.builder()
                .id(FILE_ID)
                .userId(OWNER_ID)
                .fileName("test.pdf")
                .path("")
                .cosKey("1/test.pdf")
                .sizeBytes(1024L)
                .mimeType("application/pdf")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    // ==================== shareFile ====================

    @Nested
    @DisplayName("shareFile - 共享文件")
    class ShareFileTests {

        @Test
        @DisplayName("成功共享文件给其他用户（VIEW 权限）")
        void shareFile_view_success() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(mockUser(OTHER_USER_ID, "user2")));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.empty());
            when(fileShareRepository.save(any(FileShareEntity.class))).thenAnswer(inv -> {
                FileShareEntity e = inv.getArgument(0);
                e.setId(1L);
                e.setCreatedAt(LocalDateTime.now());
                return e;
            });

            ShareDTO result = fileService.shareFile(OWNER_ID, FILE_ID, OTHER_USER_ID, "VIEW");

            assertThat(result).isNotNull();
            assertThat(result.getPermission()).isEqualTo("VIEW");
            assertThat(result.getSharedWithUserId()).isEqualTo(OTHER_USER_ID);
            verify(fileShareRepository).save(any(FileShareEntity.class));
        }

        @Test
        @DisplayName("成功共享文件给其他用户（EDIT 权限）")
        void shareFile_edit_success() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(mockUser(OTHER_USER_ID, "user2")));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.empty());
            when(fileShareRepository.save(any(FileShareEntity.class))).thenAnswer(inv -> {
                FileShareEntity e = inv.getArgument(0);
                e.setId(1L);
                e.setCreatedAt(LocalDateTime.now());
                return e;
            });

            ShareDTO result = fileService.shareFile(OWNER_ID, FILE_ID, OTHER_USER_ID, "EDIT");

            assertThat(result.getPermission()).isEqualTo("EDIT");
        }

        @Test
        @DisplayName("已共享时更新权限")
        void shareFile_updateExisting() {
            FileShareEntity existing = FileShareEntity.builder()
                    .id(1L)
                    .fileId(FILE_ID)
                    .sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW)
                    .createdAt(LocalDateTime.now())
                    .build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(mockUser(OTHER_USER_ID, "user2")));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.of(existing));
            when(fileShareRepository.save(any(FileShareEntity.class))).thenAnswer(inv -> inv.getArgument(0));

            ShareDTO result = fileService.shareFile(OWNER_ID, FILE_ID, OTHER_USER_ID, "EDIT");

            assertThat(result.getPermission()).isEqualTo("EDIT");
            verify(fileShareRepository).save(existing);
        }

        @Test
        @DisplayName("不能共享给自己")
        void shareFile_selfShare_throws() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            assertThatThrownBy(() -> fileService.shareFile(OWNER_ID, FILE_ID, OWNER_ID, "VIEW"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("目标用户不存在时抛异常")
        void shareFile_targetNotFound_throws() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> fileService.shareFile(OWNER_ID, FILE_ID, OTHER_USER_ID, "VIEW"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.USER_NOT_FOUND);
        }

        @Test
        @DisplayName("无效权限值时抛异常")
        void shareFile_invalidPermission_throws() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(mockUser(OTHER_USER_ID, "user2")));

            assertThatThrownBy(() -> fileService.shareFile(OWNER_ID, FILE_ID, OTHER_USER_ID, "INVALID"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("非文件所有者不能共享")
        void shareFile_notOwner_throws() {
            FileEntity otherFile = FileEntity.builder().id(FILE_ID).userId(99L).build();
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(otherFile));

            assertThatThrownBy(() -> fileService.shareFile(OWNER_ID, FILE_ID, OTHER_USER_ID, "VIEW"))
                    .isInstanceOf(com.miao.toolbox.storage.exception.StorageException.class);
        }
    }

    // ==================== unshareFile ====================

    @Nested
    @DisplayName("unshareFile - 取消共享")
    class UnshareFileTests {

        @Test
        @DisplayName("成功取消共享")
        void unshareFile_success() {
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findById(1L)).thenReturn(Optional.of(share));

            fileService.unshareFile(OWNER_ID, FILE_ID, 1L);

            verify(fileShareRepository).delete(share);
        }

        @Test
        @DisplayName("共享记录不存在时抛异常")
        void unshareFile_notFound_throws() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> fileService.unshareFile(OWNER_ID, FILE_ID, 999L))
                    .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("共享记录与文件不匹配时抛异常")
        void unshareFile_mismatch_throws() {
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(999L).sharedWithUserId(OTHER_USER_ID).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findById(1L)).thenReturn(Optional.of(share));

            assertThatThrownBy(() -> fileService.unshareFile(OWNER_ID, FILE_ID, 1L))
                    .isInstanceOf(BusinessException.class);
        }
    }

    // ==================== updateSharePermission ====================

    @Nested
    @DisplayName("updateSharePermission - 更新共享权限")
    class UpdateSharePermissionTests {

        @Test
        @DisplayName("成功将 VIEW 更新为 EDIT")
        void updateSharePermission_toEdit_success() {
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findById(1L)).thenReturn(Optional.of(share));
            when(fileShareRepository.save(any(FileShareEntity.class))).thenAnswer(inv -> inv.getArgument(0));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(mockUser(OTHER_USER_ID, "user2")));

            ShareDTO result = fileService.updateSharePermission(OWNER_ID, FILE_ID, 1L, "EDIT");

            assertThat(result.getPermission()).isEqualTo("EDIT");
            assertThat(share.getPermission()).isEqualTo(FileShareEntity.SharePermission.EDIT);
            verify(fileShareRepository).save(share);
        }

        @Test
        @DisplayName("成功将 EDIT 更新为 VIEW")
        void updateSharePermission_toView_success() {
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.EDIT).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findById(1L)).thenReturn(Optional.of(share));
            when(fileShareRepository.save(any(FileShareEntity.class))).thenAnswer(inv -> inv.getArgument(0));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(mockUser(OTHER_USER_ID, "user2")));

            ShareDTO result = fileService.updateSharePermission(OWNER_ID, FILE_ID, 1L, "VIEW");

            assertThat(result.getPermission()).isEqualTo("VIEW");
            assertThat(share.getPermission()).isEqualTo(FileShareEntity.SharePermission.VIEW);
        }

        @Test
        @DisplayName("共享记录不存在时抛异常")
        void updateSharePermission_notFound_throws() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> fileService.updateSharePermission(OWNER_ID, FILE_ID, 999L, "EDIT"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("共享记录与文件不匹配时抛异常")
        void updateSharePermission_mismatch_throws() {
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(999L).sharedWithUserId(OTHER_USER_ID).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findById(1L)).thenReturn(Optional.of(share));

            assertThatThrownBy(() -> fileService.updateSharePermission(OWNER_ID, FILE_ID, 1L, "EDIT"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);
        }

        @Test
        @DisplayName("非文件所有者不能更新权限")
        void updateSharePermission_notOwner_throws() {
            FileEntity otherFile = FileEntity.builder().id(FILE_ID).userId(99L).build();
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(otherFile));

            assertThatThrownBy(() -> fileService.updateSharePermission(OWNER_ID, FILE_ID, 1L, "EDIT"))
                    .isInstanceOf(com.miao.toolbox.storage.exception.StorageException.class);
        }

        @Test
        @DisplayName("无效权限值时抛异常")
        void updateSharePermission_invalidPermission_throws() {
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findById(1L)).thenReturn(Optional.of(share));

            assertThatThrownBy(() -> fileService.updateSharePermission(OWNER_ID, FILE_ID, 1L, "INVALID"))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);
        }
    }

    // ==================== listFileShares ====================

    @Nested
    @DisplayName("listFileShares - 查看文件共享列表")
    class ListFileSharesTests {

        @Test
        @DisplayName("返回文件的共享列表")
        void listFileShares_success() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            FileShareEntity share1 = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(2L)
                    .permission(FileShareEntity.SharePermission.VIEW)
                    .createdAt(LocalDateTime.now()).build();
            FileShareEntity share2 = FileShareEntity.builder()
                    .id(2L).fileId(FILE_ID).sharedWithUserId(3L)
                    .permission(FileShareEntity.SharePermission.EDIT)
                    .createdAt(LocalDateTime.now()).build();

            when(fileShareRepository.findByFileId(FILE_ID)).thenReturn(List.of(share1, share2));
            when(userRepository.findById(2L)).thenReturn(Optional.of(mockUser(2L, "user2")));
            when(userRepository.findById(3L)).thenReturn(Optional.of(mockUser(3L, "user3")));

            List<ShareDTO> result = fileService.listFileShares(OWNER_ID, FILE_ID);

            assertThat(result).hasSize(2);
            assertThat(result.get(0).getPermission()).isEqualTo("VIEW");
            assertThat(result.get(1).getPermission()).isEqualTo("EDIT");
        }
    }

    // ==================== listSharedWithMe ====================

    @Nested
    @DisplayName("listSharedWithMe - 查看共享给我的文件")
    class ListSharedWithMeTests {

        @Test
        @DisplayName("返回共享给我的文件列表")
        void listSharedWithMe_success() {
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW)
                    .createdAt(LocalDateTime.now()).build();

            when(fileShareRepository.findBySharedWithUserId(OTHER_USER_ID)).thenReturn(List.of(share));
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(userRepository.findById(OWNER_ID)).thenReturn(Optional.of(mockUser(OWNER_ID, "owner")));

            List<SharedWithMeDTO> result = fileService.listSharedWithMe(OTHER_USER_ID);

            assertThat(result).hasSize(1);
            assertThat(result.get(0).getFileName()).isEqualTo("test.pdf");
            assertThat(result.get(0).getPermission()).isEqualTo("VIEW");
            assertThat(result.get(0).getOwnerUsername()).isEqualTo("owner");
        }

        @Test
        @DisplayName("文件已删除时跳过该共享记录")
        void listSharedWithMe_fileDeleted_skipped() {
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();

            when(fileShareRepository.findBySharedWithUserId(OTHER_USER_ID)).thenReturn(List.of(share));
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.empty());

            List<SharedWithMeDTO> result = fileService.listSharedWithMe(OTHER_USER_ID);

            assertThat(result).isEmpty();
        }
    }

    // ==================== copySharedFileToMine ====================

    @Nested
    @DisplayName("copySharedFileToMine - 共享文件移入我的文件")
    class CopySharedFileToMineTests {

        @Test
        @DisplayName("成功将共享文件复制为我的文件并扣减配额")
        void copy_success() {
            User me = User.builder().id(OTHER_USER_ID).username("user2")
                    .storageUsedBytes(0L).storageQuotaBytes(10_000L).build();

            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.of(share));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(me));
            when(fileRepository.findByUserIdAndPathAndFileName(OTHER_USER_ID, "", "test.pdf"))
                    .thenReturn(Collections.emptyList());
            when(storageService.buildKey(OTHER_USER_ID, "", "test.pdf")).thenReturn("2/test.pdf");
            when(userRepository.incrementStorageUsedWithQuotaCheck(OTHER_USER_ID, 1024L)).thenReturn(1);
            when(fileRepository.save(any(FileEntity.class))).thenAnswer(inv -> {
                FileEntity e = inv.getArgument(0);
                e.setId(999L);
                return e;
            });

            FileInfoDTO result = fileService.copySharedFileToMine(OTHER_USER_ID, FILE_ID, "");

            assertThat(result).isNotNull();
            assertThat(result.getId()).isEqualTo(999L);
            assertThat(result.getFileName()).isEqualTo("test.pdf");
            verify(storageService).copyObject("1/test.pdf", "2/test.pdf");
            verify(userRepository).incrementStorageUsedWithQuotaCheck(OTHER_USER_ID, 1024L);
        }

        @Test
        @DisplayName("根目录已存在同名文件时自动追加序号")
        void copy_nameConflict_appendsSuffix() {
            User me = User.builder().id(OTHER_USER_ID).username("user2")
                    .storageUsedBytes(0L).storageQuotaBytes(10_000L).build();

            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.of(share));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(me));
            when(fileRepository.findByUserIdAndPathAndFileName(OTHER_USER_ID, "", "test.pdf"))
                    .thenReturn(List.of(FileEntity.builder().id(1L).build()));
            when(fileRepository.findByUserIdAndPathAndFileName(OTHER_USER_ID, "", "test (1).pdf"))
                    .thenReturn(Collections.emptyList());
            when(storageService.buildKey(OTHER_USER_ID, "", "test (1).pdf")).thenReturn("2/test (1).pdf");
            when(userRepository.incrementStorageUsedWithQuotaCheck(OTHER_USER_ID, 1024L)).thenReturn(1);
            when(fileRepository.save(any(FileEntity.class))).thenAnswer(inv -> {
                FileEntity e = inv.getArgument(0);
                e.setId(999L);
                return e;
            });

            FileInfoDTO result = fileService.copySharedFileToMine(OTHER_USER_ID, FILE_ID, "");

            assertThat(result.getFileName()).isEqualTo("test (1).pdf");
        }

        @Test
        @DisplayName("指定子目录时复制文件到该目录")
        void copy_toSubDir_success() {
            User me = User.builder().id(OTHER_USER_ID).username("user2")
                    .storageUsedBytes(0L).storageQuotaBytes(10_000L).build();

            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.of(share));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(me));
            when(fileRepository.findByUserIdAndPathAndFileName(OTHER_USER_ID, "docs", "test.pdf"))
                    .thenReturn(Collections.emptyList());
            when(storageService.buildKey(OTHER_USER_ID, "docs", "test.pdf")).thenReturn("2/docs/test.pdf");
            when(userRepository.incrementStorageUsedWithQuotaCheck(OTHER_USER_ID, 1024L)).thenReturn(1);
            when(fileRepository.save(any(FileEntity.class))).thenAnswer(inv -> {
                FileEntity e = inv.getArgument(0);
                e.setId(999L);
                return e;
            });

            FileInfoDTO result = fileService.copySharedFileToMine(OTHER_USER_ID, FILE_ID, "docs");

            assertThat(result.getFileName()).isEqualTo("test.pdf");
            verify(storageService).copyObject("1/test.pdf", "2/docs/test.pdf");
        }

        @Test
        @DisplayName("无共享访问权限时抛异常")
        void copy_noShare_throws() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> fileService.copySharedFileToMine(OTHER_USER_ID, FILE_ID, ""))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.PERMISSION_DENIED);
        }

        @Test
        @DisplayName("配额不足时抛异常")
        void copy_quotaExceeded_throws() {
            User me = User.builder().id(OTHER_USER_ID).username("user2")
                    .storageUsedBytes(0L).storageQuotaBytes(100L).build();

            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();

            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.of(share));
            when(userRepository.findById(OTHER_USER_ID)).thenReturn(Optional.of(me));

            assertThatThrownBy(() -> fileService.copySharedFileToMine(OTHER_USER_ID, FILE_ID, ""))
                    .isInstanceOf(com.miao.toolbox.storage.exception.StorageException.class);
        }
    }

    // ==================== 权限检查 ====================

    @Nested
    @DisplayName("checkFileAccess - 权限检查")
    class CheckFileAccessTests {

        @Test
        @DisplayName("所有者返回 OWNER")
        void checkAccess_owner() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));

            FileService.FileAccessLevel level = fileService.checkFileAccess(OWNER_ID, FILE_ID);

            assertThat(level).isEqualTo(FileService.FileAccessLevel.OWNER);
        }

        @Test
        @DisplayName("VIEW 共享用户返回 VIEW")
        void checkAccess_viewShare() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.of(share));

            FileService.FileAccessLevel level = fileService.checkFileAccess(OTHER_USER_ID, FILE_ID);

            assertThat(level).isEqualTo(FileService.FileAccessLevel.VIEW);
        }

        @Test
        @DisplayName("EDIT 共享用户返回 EDIT")
        void checkAccess_editShare() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.EDIT).build();
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.of(share));

            FileService.FileAccessLevel level = fileService.checkFileAccess(OTHER_USER_ID, FILE_ID);

            assertThat(level).isEqualTo(FileService.FileAccessLevel.EDIT);
        }

        @Test
        @DisplayName("无共享关系返回 NONE")
        void checkAccess_noShare() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.empty());

            FileService.FileAccessLevel level = fileService.checkFileAccess(OTHER_USER_ID, FILE_ID);

            assertThat(level).isEqualTo(FileService.FileAccessLevel.NONE);
        }

        @Test
        @DisplayName("文件不存在返回 NONE")
        void checkAccess_fileNotFound() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.empty());

            FileService.FileAccessLevel level = fileService.checkFileAccess(OTHER_USER_ID, FILE_ID);

            assertThat(level).isEqualTo(FileService.FileAccessLevel.NONE);
        }
    }

    // ==================== requireFileAccess ====================

    @Nested
    @DisplayName("requireFileAccess - 权限要求")
    class RequireFileAccessTests {

        @Test
        @DisplayName("VIEW 用户可以访问 VIEW 级别")
        void requireAccess_viewUser_viewLevel() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.of(share));

            FileEntity result = fileService.requireFileAccess(OTHER_USER_ID, FILE_ID, FileService.FileAccessLevel.VIEW);

            assertThat(result).isNotNull();
            assertThat(result.getId()).isEqualTo(FILE_ID);
        }

        @Test
        @DisplayName("VIEW 用户不能访问 EDIT 级别")
        void requireAccess_viewUser_editLevel_throws() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            FileShareEntity share = FileShareEntity.builder()
                    .id(1L).fileId(FILE_ID).sharedWithUserId(OTHER_USER_ID)
                    .permission(FileShareEntity.SharePermission.VIEW).build();
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.of(share));

            assertThatThrownBy(() -> fileService.requireFileAccess(OTHER_USER_ID, FILE_ID, FileService.FileAccessLevel.EDIT))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.PERMISSION_DENIED);
        }

        @Test
        @DisplayName("无权限用户不能访问任何级别")
        void requireAccess_noPermission_throws() {
            when(fileRepository.findById(FILE_ID)).thenReturn(Optional.of(ownerFile));
            when(fileShareRepository.findByFileIdAndSharedWithUserId(FILE_ID, OTHER_USER_ID))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> fileService.requireFileAccess(OTHER_USER_ID, FILE_ID, FileService.FileAccessLevel.VIEW))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.PERMISSION_DENIED);
        }
    }

    // ==================== 辅助方法 ====================

    private User mockUser(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }
}
