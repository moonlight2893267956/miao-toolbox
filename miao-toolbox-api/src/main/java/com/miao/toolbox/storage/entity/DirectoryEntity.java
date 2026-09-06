package com.miao.toolbox.storage.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 目录实体 — 对应 directories 表
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "directories")
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

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
