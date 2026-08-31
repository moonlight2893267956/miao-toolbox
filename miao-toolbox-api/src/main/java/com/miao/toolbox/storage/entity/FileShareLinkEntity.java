package com.miao.toolbox.storage.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 文件外链分享实体 — 对应 file_share_links 表
 * <p>
 * 与 {@link FileShareEntity}（站内用户间共享）语义完全隔离：
 * 本实体表示「链接码 + 提取码」的对外公开分享，访客无需登录即可访问。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "file_share_links")
public class FileShareLinkEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 链接码，URL 路径片段 /s/{shareCode} */
    @Column(name = "share_code", nullable = false, unique = true, length = 32)
    private String shareCode;

    @Column(name = "file_id", nullable = false)
    private Long fileId;

    /** 分享者 */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 提取码 BCrypt 哈希，禁止存储明文 */
    @Column(name = "access_code_hash", nullable = false)
    private String accessCodeHash;

    /** 失效时间，null 表示永久有效 */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    /** 访问次数上限，null 表示不限 */
    @Column(name = "max_visits")
    private Integer maxVisits;

    @Column(name = "visit_count", nullable = false)
    @Builder.Default
    private Integer visitCount = 0;

    /** 是否已手动取消 */
    @Column(name = "revoked", nullable = false)
    @Builder.Default
    private Boolean revoked = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    /**
     * 分享链接状态
     */
    public enum ShareStatus {
        /** 生效中 */
        ACTIVE,
        /** 已过期 */
        EXPIRED,
        /** 访问次数已用尽 */
        EXHAUSTED,
        /** 已被分享者取消 */
        REVOKED
    }

    /**
     * 计算当前状态（不做权限判断，仅根据字段推导）
     */
    public ShareStatus resolveStatus() {
        if (Boolean.TRUE.equals(revoked)) {
            return ShareStatus.REVOKED;
        }
        if (expiresAt != null && expiresAt.isBefore(LocalDateTime.now())) {
            return ShareStatus.EXPIRED;
        }
        if (maxVisits != null && visitCount >= maxVisits) {
            return ShareStatus.EXHAUSTED;
        }
        return ShareStatus.ACTIVE;
    }
}
