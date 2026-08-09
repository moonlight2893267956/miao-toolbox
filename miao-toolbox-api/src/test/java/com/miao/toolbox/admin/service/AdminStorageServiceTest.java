package com.miao.toolbox.admin.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.miao.toolbox.admin.dto.StorageOverviewResponse;
import com.miao.toolbox.admin.dto.MimeTypeDistribution;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.storage.repository.FileRepository;

@ExtendWith(MockitoExtension.class)
class AdminStorageServiceTest {

    @Mock
    private FileRepository fileRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private AdminStorageService adminStorageService;

    private User makeUser(Long id, String username, Long quota) {
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        u.setStorageQuotaBytes(quota);
        return u;
    }

    @SuppressWarnings("unchecked")
    private List<Object[]> objectArrays(Object[]... rows) {
        return Arrays.asList(rows);
    }

    @Nested
    @DisplayName("getOverview")
    class GetOverviewTests {

        @Test
        @DisplayName("正常返回存储概览")
        void returnsOverviewSuccessfully() {
            when(fileRepository.sumTotalSizeBytes()).thenReturn(5000L);
            when(fileRepository.count()).thenReturn(10L);
            doReturn(objectArrays(new Object[]{1L, 3000L}, new Object[]{2L, 2000L}))
                    .when(fileRepository).sumSizeBytesGroupByUserId();
            doReturn(objectArrays(new Object[]{1L, 6L}, new Object[]{2L, 4L}))
                    .when(fileRepository).countGroupByUserId();
            doReturn(objectArrays(new Object[]{"image/png", 3L, 1500L}, new Object[]{"text/plain", 2L, 500L}))
                    .when(fileRepository).statsGroupByMimeType();
            when(userRepository.findAll())
                    .thenReturn(List.of(makeUser(1L, "alice", 10000L), makeUser(2L, "bob", 20000L)));

            StorageOverviewResponse resp = adminStorageService.getOverview();

            assertEquals(5000L, resp.getTotalBytes());
            assertEquals(10L, resp.getTotalFiles());
            assertEquals(2L, resp.getUserCount());
            assertEquals(2, resp.getUsers().size());
            // alice 用量最大排第一
            assertEquals("alice", resp.getUsers().get(0).getUsername());
            assertEquals(3000L, resp.getUsers().get(0).getUsedBytes());
            assertEquals(30.0, resp.getUsers().get(0).getPercentage());
            assertEquals(2, resp.getTypeDistribution().size());
        }

        @Test
        @DisplayName("无文件时返回零值")
        void returnsZeroWhenNoFiles() {
            when(fileRepository.sumTotalSizeBytes()).thenReturn(0L);
            when(fileRepository.count()).thenReturn(0L);
            doReturn(new ArrayList<Object[]>()).when(fileRepository).sumSizeBytesGroupByUserId();
            doReturn(new ArrayList<Object[]>()).when(fileRepository).countGroupByUserId();
            doReturn(new ArrayList<Object[]>()).when(fileRepository).statsGroupByMimeType();
            when(userRepository.findAll()).thenReturn(List.of(makeUser(1L, "alice", 10000L)));

            StorageOverviewResponse resp = adminStorageService.getOverview();

            assertEquals(0L, resp.getTotalBytes());
            assertEquals(0L, resp.getTotalFiles());
            assertEquals(1L, resp.getUserCount());
            assertEquals(0L, resp.getUsers().get(0).getUsedBytes());
            assertTrue(resp.getTypeDistribution().isEmpty());
        }

        @Test
        @DisplayName("MIME 类型按前缀分组，未知类型归入 other")
        void groupsMimeTypesCorrectly() {
            when(fileRepository.sumTotalSizeBytes()).thenReturn(1000L);
            when(fileRepository.count()).thenReturn(5L);
            doReturn(new ArrayList<Object[]>()).when(fileRepository).sumSizeBytesGroupByUserId();
            doReturn(new ArrayList<Object[]>()).when(fileRepository).countGroupByUserId();
            doReturn(objectArrays(
                    new Object[]{"image/png", 2L, 400L},
                    new Object[]{"image/jpeg", 1L, 300L},
                    new Object[]{"application/pdf", 1L, 200L},
                    new Object[]{"video/mp4", 1L, 100L}
            )).when(fileRepository).statsGroupByMimeType();
            when(userRepository.findAll()).thenReturn(List.of());

            StorageOverviewResponse resp = adminStorageService.getOverview();

            List<MimeTypeDistribution> dist = resp.getTypeDistribution();
            assertEquals(3, dist.size());
            MimeTypeDistribution imageDist = dist.stream()
                    .filter(d -> "image".equals(d.getType())).findFirst().orElseThrow();
            assertEquals(3L, imageDist.getCount());
            assertEquals(700L, imageDist.getTotalBytes());

            MimeTypeDistribution otherDist = dist.stream()
                    .filter(d -> "other".equals(d.getType())).findFirst().orElseThrow();
            assertEquals(1L, otherDist.getCount());
            assertEquals(200L, otherDist.getTotalBytes());
        }

        @Test
        @DisplayName("用户配额为0时百分比为0")
        void zeroQuotaGivesZeroPercentage() {
            when(fileRepository.sumTotalSizeBytes()).thenReturn(100L);
            when(fileRepository.count()).thenReturn(1L);
            doReturn(objectArrays(new Object[]{1L, 100L}))
                    .when(fileRepository).sumSizeBytesGroupByUserId();
            doReturn(objectArrays(new Object[]{1L, 1L}))
                    .when(fileRepository).countGroupByUserId();
            doReturn(new ArrayList<Object[]>()).when(fileRepository).statsGroupByMimeType();
            when(userRepository.findAll())
                    .thenReturn(List.of(makeUser(1L, "alice", 0L)));

            StorageOverviewResponse resp = adminStorageService.getOverview();

            assertEquals(0.0, resp.getUsers().get(0).getPercentage());
        }

        @Test
        @DisplayName("用量超过配额时百分比上限100")
        void percentageCappedAt100() {
            when(fileRepository.sumTotalSizeBytes()).thenReturn(200L);
            when(fileRepository.count()).thenReturn(1L);
            doReturn(objectArrays(new Object[]{1L, 200L}))
                    .when(fileRepository).sumSizeBytesGroupByUserId();
            doReturn(objectArrays(new Object[]{1L, 1L}))
                    .when(fileRepository).countGroupByUserId();
            doReturn(new ArrayList<Object[]>()).when(fileRepository).statsGroupByMimeType();
            when(userRepository.findAll())
                    .thenReturn(List.of(makeUser(1L, "alice", 100L)));

            StorageOverviewResponse resp = adminStorageService.getOverview();

            assertEquals(100.0, resp.getUsers().get(0).getPercentage());
        }
    }
}
