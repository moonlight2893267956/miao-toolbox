package com.miao.toolbox.auth.entity;

import com.miao.toolbox.auth.dto.RoleBrief;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String username;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(unique = true)
    private String email;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "user_roles",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    @Builder.Default
    @ToString.Exclude
    private Set<Role> roles = new HashSet<>();

    @Column(name = "is_enabled", nullable = false)
    private Boolean isEnabled = true;

    @Column(name = "must_change_password", nullable = false)
    private Boolean mustChangePassword = false;

    @Column(name = "github_id", unique = true)
    private String githubId;

    @Column(name = "github_username")
    private String githubUsername;

    @Column(name = "google_id", unique = true)
    private String googleId;

    @Column(name = "google_username")
    private String googleUsername;

    @Column(name = "signing_key")
    private String signingKey;

    @Column(name = "login_fail_count", nullable = false)
    private Integer loginFailCount = 0;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    /**
     * 返回角色码列表
     */
    public List<String> getRoleCodes() {
        if (roles == null || roles.isEmpty()) {
            return Collections.emptyList();
        }
        return roles.stream().map(Role::getCode).collect(Collectors.toList());
    }

    /**
     * 判断用户是否拥有某个角色码
     */
    public boolean hasRole(String roleCode) {
        return getRoleCodes().contains(roleCode);
    }

    /**
     * 判断用户是否是超级管理员
     */
    public boolean isSuperAdmin() {
        return hasRole("SUPER_ADMIN");
    }

    /**
     * 返回角色信息列表（用于 API 响应）
     */
    public List<RoleBrief> toRoleBriefs() {
        if (roles == null || roles.isEmpty()) {
            return Collections.emptyList();
        }
        return roles.stream()
                .map(r -> RoleBrief.builder().id(r.getId()).code(r.getCode()).name(r.getName()).build())
                .collect(Collectors.toList());
    }
}
