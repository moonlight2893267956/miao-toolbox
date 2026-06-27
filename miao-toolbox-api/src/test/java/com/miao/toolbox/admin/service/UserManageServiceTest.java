package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.AdminUserResponse;
import com.miao.toolbox.admin.dto.SetRateLimitRequest;
import com.miao.toolbox.admin.dto.SetRoleRequest;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.RedisKey;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserManageServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private RedisTemplate<String, Object> redisTemplate;
    @Mock private ValueOperations<String, Object> valueOperations;

    @InjectMocks
    private UserManageService userManageService;

    private User testUser;
    private User adminUser;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(2L)
                .username("testuser")
                .email("test@example.com")
                .role(User.Role.USER)
                .isEnabled(true)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        adminUser = User.builder()
                .id(1L)
                .username("admin")
                .email("admin@example.com")
                .role(User.Role.ADMIN)
                .isEnabled(true)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    // ===== listUsers =====

    @Test
    void listUsers_returnsPagedResults() {
        Page<User> page = new PageImpl<>(List.of(testUser, adminUser));
        when(userRepository.findAll(any(Pageable.class))).thenReturn(page);

        PagedResponse<AdminUserResponse> result = userManageService.listUsers(1, 20);

        assertEquals(2, result.getItems().size());
        assertEquals(2, result.getTotal());
        assertEquals("testuser", result.getItems().get(0).getUsername());
    }

    @Test
    void listUsers_clampsPageSize() {
        Page<User> page = new PageImpl<>(List.of());
        when(userRepository.findAll(any(Pageable.class))).thenReturn(page);

        PagedResponse<AdminUserResponse> result = userManageService.listUsers(1, 500);

        assertEquals(100, result.getPageSize());
    }

    // ===== disableUser =====

    @Test
    void disableUser_success() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        userManageService.disableUser(2L, 1L);

        verify(valueOperations).set(
                eq(RedisKey.USER_STATUS_PREFIX + "2"),
                eq("disabled"),
                any(Duration.class)
        );
    }

    @Test
    void disableUser_alreadyDisabled_throws() {
        testUser.setIsEnabled(false);
        when(userRepository.findById(2L)).thenReturn(Optional.of(testUser));

        assertThrows(BusinessException.class, () -> userManageService.disableUser(2L, 1L));
    }

    @Test
    void disableUser_notFound_throws() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(BusinessException.class, () -> userManageService.disableUser(99L, 1L));
    }

    // ===== enableUser =====

    @Test
    void enableUser_success() {
        testUser.setIsEnabled(false);
        when(userRepository.findById(2L)).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        userManageService.enableUser(2L, 1L);

        verify(redisTemplate).delete(RedisKey.USER_STATUS_PREFIX + "2");
    }

    @Test
    void enableUser_alreadyEnabled_throws() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(testUser));

        assertThrows(BusinessException.class, () -> userManageService.enableUser(2L, 1L));
    }

    // ===== setRole =====

    @Test
    void setRole_success() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        SetRoleRequest request = new SetRoleRequest();
        request.setRole("ADMIN");

        userManageService.setRole(2L, request, 1L);

        assertEquals(User.Role.ADMIN, testUser.getRole());
    }

    @Test
    void setRole_invalidRole_throws() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(testUser));

        SetRoleRequest request = new SetRoleRequest();
        request.setRole("SUPERUSER");

        assertThrows(BusinessException.class, () -> userManageService.setRole(2L, request, 1L));
    }

    @Test
    void setRole_cannotDemoteLastAdmin() {
        // Only one admin in the system
        when(userRepository.findById(1L)).thenReturn(Optional.of(adminUser));
        when(userRepository.findAll()).thenReturn(List.of(adminUser));

        SetRoleRequest request = new SetRoleRequest();
        request.setRole("USER");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> userManageService.setRole(1L, request, 1L));
        assertTrue(ex.getMessage().contains("至少需要保留一个管理员"));
    }

    @Test
    void setRole_canDemoteAdmin_whenMultipleAdmins() {
        User admin2 = User.builder().id(3L).username("admin2").role(User.Role.ADMIN).build();
        when(userRepository.findById(1L)).thenReturn(Optional.of(adminUser));
        when(userRepository.findAll()).thenReturn(List.of(adminUser, admin2));
        when(userRepository.save(any(User.class))).thenReturn(adminUser);

        SetRoleRequest request = new SetRoleRequest();
        request.setRole("USER");

        userManageService.setRole(1L, request, 1L);

        assertEquals(User.Role.USER, adminUser.getRole());
    }

    // ===== setRateLimit =====

    @Test
    void setRateLimit_success() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(testUser));

        SetRateLimitRequest request = new SetRateLimitRequest();
        request.setMaxRequestsPerMinute(30);

        userManageService.setRateLimit(2L, request, 1L);

        verify(valueOperations).set(
                eq(RedisKey.RATE_LIMIT_CUSTOM_PREFIX + "2"),
                eq(30),
                any(Duration.class)
        );
    }

    @Test
    void setRateLimit_userNotFound_throws() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        SetRateLimitRequest request = new SetRateLimitRequest();
        request.setMaxRequestsPerMinute(30);

        assertThrows(BusinessException.class, () -> userManageService.setRateLimit(99L, request, 1L));
    }
}
