package com.miao.toolbox.storage.service;

import com.miao.toolbox.auth.repository.UserRepository;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Story 5.5 排序规则单元测试
 *
 * <p>只断言传给 Repository 的 Sort，不校验返回数据——
 * 排序是由数据库执行的，Service 的职责是「把参数正确翻译成 Sort」。</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("FileService 排序规则单元测试")
class FileServiceSortTest {

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

    @BeforeEach
    void setUp() {
        fileService = new FileService(
                fileRepository, directoryRepository, fileShareRepository, fileShareLinkRepository,
                userRepository, storageService, storageProperties, fileNameValidator, notificationService
        );
        // 返回空页：toFileInfoDTO 不会被调用，避免 DTO 依赖的 mock 干扰排序断言。
        // 用 lenient：只断言 Sort 的用例不会同时用到两个 Repository，
        // 严格模式下未使用的 stub 会被判为 UnnecessaryStubbing。
        lenient().when(fileRepository.findByUserIdAndPath(anyLong(), anyString(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(Collections.emptyList()));
        lenient().when(directoryRepository.findByUserIdAndParentPath(anyLong(), anyString(), any(Sort.class)))
                .thenReturn(Collections.emptyList());
    }

    /** 捕获传给 fileRepository 的 Pageable 并取最后一次调用的 Sort 单元素 */
    private Sort.Order captureFileSortOrder() {
        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(fileRepository, atLeastOnce()).findByUserIdAndPath(anyLong(), anyString(), captor.capture());
        List<Pageable> all = captor.getAllValues();
        Sort sort = all.get(all.size() - 1).getSort();
        assertThat(sort.isSorted()).as("排序参数必须存在").isTrue();
        return sort.toList().get(0);
    }

    @Nested
    @DisplayName("AC-1/AC-2: 文件排序字段与方向")
    class FileSort {

        @Test
        @DisplayName("sortBy=name → 按 fileName 排序")
        void sortByName() {
            fileService.listFiles(USER_ID, "", 0, 20, "name", "asc");
            Sort.Order order = captureFileSortOrder();
            assertThat(order.getProperty()).isEqualTo("fileName");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.ASC);
        }

        @Test
        @DisplayName("sortBy=size → 按 sizeBytes 排序")
        void sortBySize() {
            fileService.listFiles(USER_ID, "", 0, 20, "size", "desc");
            Sort.Order order = captureFileSortOrder();
            assertThat(order.getProperty()).isEqualTo("sizeBytes");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.DESC);
        }

        @Test
        @DisplayName("sortBy=updatedAt → 按 updatedAt 排序")
        void sortByUpdatedAt() {
            fileService.listFiles(USER_ID, "", 0, 20, "updatedAt", "asc");
            Sort.Order order = captureFileSortOrder();
            assertThat(order.getProperty()).isEqualTo("updatedAt");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.ASC);
        }

        @Test
        @DisplayName("sortBy=type → 按 mimeType 排序")
        void sortByType() {
            fileService.listFiles(USER_ID, "", 0, 20, "type", "desc");
            Sort.Order order = captureFileSortOrder();
            assertThat(order.getProperty()).isEqualTo("mimeType");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.DESC);
        }

        @Test
        @DisplayName("四个字段 × 双向共 8 种组合全部映射到正确实体属性")
        void allFieldDirectionCombinations() {
            assertThat(orderOf("name", "asc")).isEqualTo("fileName:ASC");
            assertThat(orderOf("name", "desc")).isEqualTo("fileName:DESC");
            assertThat(orderOf("size", "asc")).isEqualTo("sizeBytes:ASC");
            assertThat(orderOf("size", "desc")).isEqualTo("sizeBytes:DESC");
            assertThat(orderOf("updatedAt", "asc")).isEqualTo("updatedAt:ASC");
            assertThat(orderOf("updatedAt", "desc")).isEqualTo("updatedAt:DESC");
            assertThat(orderOf("type", "asc")).isEqualTo("mimeType:ASC");
            assertThat(orderOf("type", "desc")).isEqualTo("mimeType:DESC");
        }

        private String orderOf(String sortBy, String sortDir) {
            fileService.listFiles(USER_ID, "", 0, 20, sortBy, sortDir);
            Sort.Order order = captureFileSortOrder();
            return order.getProperty() + ":" + order.getDirection();
        }

        @Test
        @DisplayName("sortDir 大小写不敏感：ASC 与 asc 等价")
        void sortDirCaseInsensitive() {
            fileService.listFiles(USER_ID, "", 0, 20, "name", "ASC");
            Sort.Order order = captureFileSortOrder();
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.ASC);
        }
    }

    @Nested
    @DisplayName("非法参数回退")
    class Fallback {

        @Test
        @DisplayName("未知 sortBy → 字段回退 updatedAt，方向仍按入参 asc")
        void unknownSortByFallsBack() {
            fileService.listFiles(USER_ID, "", 0, 20, "unknownField", "asc");
            Sort.Order order = captureFileSortOrder();
            assertThat(order.getProperty()).isEqualTo("updatedAt");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.ASC);
        }

        @Test
        @DisplayName("sortBy 为 null → 回退 updatedAt DESC")
        void nullSortByFallsBack() {
            fileService.listFiles(USER_ID, "", 0, 20, null, null);
            Sort.Order order = captureFileSortOrder();
            assertThat(order.getProperty()).isEqualTo("updatedAt");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.DESC);
        }

        @Test
        @DisplayName("非法 sortDir → 回退 DESC，不抛异常")
        void invalidSortDirFallsBack() {
            fileService.listFiles(USER_ID, "", 0, 20, "name", "sideways");
            Sort.Order order = captureFileSortOrder();
            assertThat(order.getProperty()).isEqualTo("fileName");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.DESC);
        }

        @Test
        @DisplayName("四参重载（旧调用方）保持默认 updatedAt DESC，无回归")
        void legacyFourArgOverload() {
            fileService.listFiles(USER_ID, "", 0, 20);
            Sort.Order order = captureFileSortOrder();
            assertThat(order.getProperty()).isEqualTo("updatedAt");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.DESC);
        }
    }

    @Nested
    @DisplayName("目录排序")
    class DirectorySort {

        private Sort.Order captureDirSortOrder() {
            ArgumentCaptor<Sort> captor = ArgumentCaptor.forClass(Sort.class);
            verify(directoryRepository, atLeastOnce())
                    .findByUserIdAndParentPath(anyLong(), anyString(), captor.capture());
            List<Sort> all = captor.getAllValues();
            return all.get(all.size() - 1).toList().get(0);
        }

        @Test
        @DisplayName("默认按名称升序")
        void defaultAscByName() {
            fileService.listDirectories(USER_ID, "");
            Sort.Order order = captureDirSortOrder();
            assertThat(order.getProperty()).isEqualTo("name");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.ASC);
        }

        @Test
        @DisplayName("sortDir=desc → 按名称降序")
        void descByName() {
            fileService.listDirectories(USER_ID, "", "desc");
            Sort.Order order = captureDirSortOrder();
            assertThat(order.getProperty()).isEqualTo("name");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.DESC);
        }

        @Test
        @DisplayName("非法 sortDir → 回退升序")
        void invalidDirSortDirFallsBack() {
            fileService.listDirectories(USER_ID, "", "whatever");
            Sort.Order order = captureDirSortOrder();
            assertThat(order.getProperty()).isEqualTo("name");
            assertThat(order.getDirection()).isEqualTo(Sort.Direction.ASC);
        }
    }

    @Nested
    @DisplayName("返回结果不受影响")
    class ResultPassthrough {

        @Test
        @DisplayName("排序参数不改变返回的文件集合")
        void returnsFilesFromRepository() {
            FileEntity f = FileEntity.builder()
                    .id(10L).userId(USER_ID).fileName("a.txt").path("")
                    .cosKey("1/a.txt").sizeBytes(100L).mimeType("text/plain")
                    .build();
            when(fileRepository.findByUserIdAndPath(anyLong(), anyString(), any(Pageable.class)))
                    .thenReturn(new PageImpl<>(List.of(f)));

            var page = fileService.listFiles(USER_ID, "", 0, 20, "name", "asc");

            assertThat(page.getContent()).hasSize(1);
            assertThat(page.getContent().get(0).getFileName()).isEqualTo("a.txt");
        }

        @Test
        @DisplayName("目录列表原样返回")
        void returnsDirectoriesFromRepository() {
            DirectoryEntity dir = DirectoryEntity.builder()
                    .id(5L).userId(USER_ID).name("docs").path("docs").parentPath("")
                    .build();
            when(directoryRepository.findByUserIdAndParentPath(anyLong(), anyString(), any(Sort.class)))
                    .thenReturn(List.of(dir));

            List<DirectoryEntity> dirs = fileService.listDirectories(USER_ID, "", "asc");

            assertThat(dirs).hasSize(1);
            assertThat(dirs.get(0).getName()).isEqualTo("docs");
        }
    }
}
