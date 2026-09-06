package com.miao.toolbox.storage.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;

import java.time.LocalDateTime;

/**
 * 目录实体 — 对应 directories 表
 * <p>
 * 废纸篓机制（V32）：deleted_at 非空表示已删除（在废纸篓中），
 * 此时整棵子树的 path/parent_path 迁移到 "__trash/{dirId}/" 前缀下。
 * {@code @SQLRestriction} 让所有常规查询自动排除已删除目录。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "directories")
@SQLRestriction("deleted_at IS NULL")
public class DirectoryEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String path;

    @Column(name = "parent_path", nullable = false)
    @Builder.Default
    private String parentPath = "";

    /**
     * 父目录内的自定义排序序号（「自定义」排序模式，越小越靠前；V31 迁移引入）。
     * 与 files.custom_order 同构：目录与文件各自在所属父目录维度独立编号。
     */
    @Column(name = "custom_order", nullable = false)
    @Builder.Default
    private Integer customOrder = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** 废纸篓标记：NULL=正常，非空=删除时间（V32 废纸篓机制） */
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
