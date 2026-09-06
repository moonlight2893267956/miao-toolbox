package com.miao.toolbox.storage.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDateTime;

/**
 * 文件实体 — 对应 files 表
 * <p>
 * 废纸篓机制（V32）：deleted_at 非空表示已删除（在废纸篓中）。
 * {@code @SQLRestriction} 让所有常规查询自动排除已删除文件，
 * 废纸篓查询用 native SQL 绕过限制。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "files")
@SQLRestriction("deleted_at IS NULL")
public class FileEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(nullable = false)
    @Builder.Default
    private String path = "";

    @Column(name = "cos_key", nullable = false, unique = true)
    private String cosKey;

    @Column(name = "size_bytes", nullable = false)
    private Long sizeBytes;

    @Column(name = "mime_type")
    private String mimeType;

    @Column(name = "cos_etag")
    private String cosEtag;

    /** 目录内自定义排序序号（「自定义」排序模式，越小越靠前；V30 迁移引入） */
    @Column(name = "custom_order", nullable = false)
    @Builder.Default
    private Integer customOrder = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /** 废纸篓标记：NULL=正常，非空=删除时间（V32 废纸篓机制） */
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
