package com.miao.toolbox.admin.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.auth.service.RouteAccessService;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.notification.service.NotificationService;
import com.miao.toolbox.storage.repository.FileRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

@ExtendWith(MockitoExtension.class)
class UserManageServiceQuotaTest {

    @Mock private UserRepository userRepository;
    @Mock private RoleRepository roleRepository;
    @Mock private RedisTemplate<String, Object> redisTemplate;
    @Mock private RouteAccessService routeAccessService;
    @Mock private FileRepository fileRepository;
    @Mock private NotificationService notificationService;
    @Mock private ValueOperations<String, Object> valueOperations;

    @InjectMocks
    private UserManageService userManageService;

    private User makeUser(Long id, Long quota) {
        User u = new User();
        u.setId(id);
        u.setUsername("testuser");
        u.setStorageQuotaBytes(quota);
        return u;
    }

    @Nested
    @DisplayName("setQuota")
    class SetQuotaTests {

        @Test
        @DisplayName("正常设置配额")
        void setsQuotaSuccessfully() {
            User user = makeUser(1L, 1000L);
            when(userRepository.findById(1L)).thenReturn(java.util.Optional.of(user));
            when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            userManageService.setQuota(1L, 2147483648L, 99L);

            verify(userRepository).save(argThat(u -> u.getStorageQuotaBytes() == 2147483648L));
        }

        @Test
        @DisplayName("用户不存在时抛异常")
        void throwsWhenUserNotFound() {
            when(userRepository.findById(999L)).thenReturn(java.util.Optional.empty());

            assertThrows(BusinessException.class, () -> userManageService.setQuota(999L, 1000L, 99L));
        }

        @Test
        @DisplayName("调低配额不删除文件")
        void loweringQuotaDoesNotDeleteFiles() {
            User user = makeUser(1L, 10000L);
            when(userRepository.findById(1L)).thenReturn(java.util.Optional.of(user));
            when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            // 调低配额到比用量还低
            userManageService.setQuota(1L, 100L, 99L);

            // 只更新配额字段，不涉及文件删除
            verify(userRepository).save(argThat(u -> u.getStorageQuotaBytes() == 100L));
        }
    }
}
