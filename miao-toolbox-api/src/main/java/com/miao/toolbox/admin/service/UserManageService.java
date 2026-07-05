package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.AdminUserResponse;
import com.miao.toolbox.admin.dto.SetRateLimitRequest;
import com.miao.toolbox.admin.dto.SetRoleRequest;
import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.auth.service.RouteAccessService;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.constant.RedisKey;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
public class UserManageService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final RedisTemplate<String, Object> redisTemplate;
    private final RouteAccessService routeAccessService;

    public UserManageService(UserRepository userRepository, RoleRepository roleRepository,
                             RedisTemplate<String, Object> redisTemplate,
                             RouteAccessService routeAccessService) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.redisTemplate = redisTemplate;
        this.routeAccessService = routeAccessService;
    }

    /**
     * 获取用户分页列表。
     * 使用 JOIN FETCH 预加载 roles，避免 N+1 查询。
     */
    @Transactional(readOnly = true)
    public PagedResponse<AdminUserResponse> listUsers(int page, int pageSize) {
        int safePage = Math.max(page, 1) - 1;
        int safePageSize = Math.min(Math.max(pageSize, 1), 100);

        Page<User> pageResult = userRepository.findAllWithRoles(
                PageRequest.of(safePage, safePageSize, Sort.by(Sort.Direction.DESC, "createdAt"))
        );

        List<AdminUserResponse> items = pageResult.getContent().stream()
                .map(this::toResponse)
                .toList();

        PagedResponse<AdminUserResponse> response = new PagedResponse<>();
        response.setItems(items);
        response.setTotal(pageResult.getTotalElements());
        response.setPage(page);
        response.setPageSize(safePageSize);
        return response;
    }

    /**
     * 禁用用户
     */
    @Transactional
    public void disableUser(Long userId, Long operatorId) {
        User user = findUserOrThrow(userId);
        if (!user.getIsEnabled()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "用户已被禁用", 400);
        }
        user.setIsEnabled(false);
        userRepository.save(user);

        // Redis 写入禁用标记
        redisTemplate.opsForValue().set(
                RedisKey.USER_STATUS_PREFIX + userId,
                "disabled",
                Duration.ofDays(365)
        );

        log.info("用户 {} 被管理员 {} 禁用", userId, operatorId);
    }

    /**
     * 启用用户
     */
    @Transactional
    public void enableUser(Long userId, Long operatorId) {
        User user = findUserOrThrow(userId);
        if (user.getIsEnabled()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "用户已被启用", 400);
        }
        user.setIsEnabled(true);
        userRepository.save(user);

        // Redis 清除禁用标记
        redisTemplate.delete(RedisKey.USER_STATUS_PREFIX + userId);

        log.info("用户 {} 被管理员 {} 启用", userId, operatorId);
    }

    /**
     * 变更用户角色
     */
    @Transactional
    public void setRole(Long userId, SetRoleRequest request, Long operatorId) {
        User user = findUserOrThrow(userId);

        if (request.getRoleIds() == null || request.getRoleIds().isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "用户至少需要一个角色", 422);
        }

        List<Role> newRoles = roleRepository.findAllById(request.getRoleIds());
        if (newRoles.size() != request.getRoleIds().size()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "包含无效的角色ID", 400);
        }

        // 检查是否有系统内置角色被分配给非管理员用户
        boolean hasSuperAdmin = newRoles.stream().anyMatch(r -> "SUPER_ADMIN".equals(r.getCode()));

        // 不能移除最后一个超级管理员 — 通过 DB 计数避免全表加载到内存
        if (user.isSuperAdmin() && !hasSuperAdmin) {
            long superAdminCount = userRepository.countByRolesCode("SUPER_ADMIN");
            if (superAdminCount <= 1) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED, "系统至少需要保留一个超级管理员", 422);
            }
        }

        user.setRoles(new HashSet<>(newRoles));
        userRepository.save(user);
        routeAccessService.evictUserRoutes(userId);

        log.info("用户 {} 角色被管理员 {} 更新为 {}", userId, operatorId,
                newRoles.stream().map(Role::getCode).toList());
    }

    /**
     * 设置用户自定义限流
     */
    public void setRateLimit(Long userId, SetRateLimitRequest request, Long operatorId) {
        findUserOrThrow(userId); // 确认用户存在

        String redisKey = RedisKey.RATE_LIMIT_CUSTOM_PREFIX + userId;
        redisTemplate.opsForValue().set(redisKey, request.getMaxRequestsPerMinute(), Duration.ofDays(365));

        log.info("管理员 {} 设置用户 {} 自定义限流: {}次/分钟", operatorId, userId, request.getMaxRequestsPerMinute());
    }

    private User findUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "用户不存在", 404));
    }

    private AdminUserResponse toResponse(User user) {
        AdminUserResponse resp = new AdminUserResponse();
        resp.setId(user.getId());
        resp.setUsername(user.getUsername());
        resp.setEmail(user.getEmail());
        resp.setRoles(user.toRoleBriefs());
        resp.setIsEnabled(user.getIsEnabled());
        resp.setLastLoginAt(user.getLastLoginAt());
        resp.setCreatedAt(user.getCreatedAt());
        return resp;
    }
}
