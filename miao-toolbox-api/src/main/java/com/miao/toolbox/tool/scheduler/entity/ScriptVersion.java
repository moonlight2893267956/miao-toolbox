package com.miao.toolbox.tool.scheduler.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 脚本版本实体（scheduler_script_versions 表，V35）。
 *
 * <p>每次脚本内容变更生成新版本（自增版本号，从 1 开始）。
 * {@code content} 存脚本全文（LONGTEXT，应用层限 64KB）。
 * 版本不可修改（只新增不覆盖），任务绑定特定版本确保执行内容稳定。
 *
 * <p>{@code createdAt} 由 {@link #onCreate()} 在持久化前填充：列虽有 DB 默认值，
 * 但 Hibernate 会把该字段纳入 INSERT 并显式写入 NULL，必须由实体自行赋值
 * （与 {@code Script}/{@code ScheduledTask} 一致）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "scheduler_script_versions")
public class ScriptVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "script_id", nullable = false)
    private Long scriptId;

    @Column(nullable = false)
    private Integer version;

    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private String content;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
