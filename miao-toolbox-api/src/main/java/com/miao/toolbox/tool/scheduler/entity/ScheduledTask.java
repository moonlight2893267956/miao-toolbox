package com.miao.toolbox.tool.scheduler.entity;

import com.miao.toolbox.tool.scheduler.converter.NotifyConfigConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Builder.Default;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

/**
 * 定时任务配置实体（scheduled_tasks 表，V33 创建 / V35 改造）。
 *
 * <p>V35 改造：移除 {@code targetType}/{@code targetConfig}（HTTP/PRESET 目标），
 * 改为 {@code scriptId}/{@code scriptVersion}/{@code params}（脚本引用 + 参数快照）。
 *
 * <p>{@code notifyConfig} 通过 AttributeConverter 与 JSON 列互转；
 * {@code params} 为 JSON 文本（参数值快照，不受后续 schema 变更影响）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "scheduled_tasks")
public class ScheduledTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(length = 200)
    private String description;

    /** 关联脚本 ID（外键 ON DELETE RESTRICT，V35） */
    @Column(name = "script_id")
    private Long scriptId;

    /** 绑定的脚本版本号（任务绑定特定版本，非 latest） */
    @Column(name = "script_version")
    private Integer scriptVersion;

    /** 参数值快照 JSON（{name: value}，创建时绑定，不受后续 schema 变更影响） */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "params")
    private String params;

    /** cron 表达式（5/6 位） */
    @Column(name = "cron_expression", nullable = false, length = 120)
    private String cronExpression;

    /** 调度时区（默认 Asia/Shanghai） */
    @Column(nullable = false, length = 40)
    private String timezone;

    /** 生效起始时间（可空） */
    @Column(name = "valid_from")
    private LocalDateTime validFrom;

    /** 生效结束时间（可空，超过后自动暂停） */
    @Column(name = "valid_until")
    private LocalDateTime validUntil;

    /** 启停状态 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Default
    private TaskStatus status = TaskStatus.ENABLED;

    /** 失败重试次数（0-5） */
    @Column(name = "retry_count", nullable = false)
    @Default
    private Integer retryCount = 0;

    /** 重试间隔（秒） */
    @Column(name = "retry_interval", nullable = false)
    @Default
    private Integer retryInterval = 60;

    /** 单次执行超时（秒，默认 60，最大 600） */
    @Column(name = "timeout_seconds", nullable = false)
    @Default
    private Integer timeoutSeconds = 60;

    /** 通知配置（JSON 列，可空 = 不通知） */
    @JdbcTypeCode(SqlTypes.JSON)
    @Convert(converter = NotifyConfigConverter.class)
    @Column(name = "notify_config")
    private NotifyConfig notifyConfig;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
