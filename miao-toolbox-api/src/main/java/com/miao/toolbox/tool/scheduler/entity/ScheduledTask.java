package com.miao.toolbox.tool.scheduler.entity;

import com.miao.toolbox.tool.scheduler.converter.NotifyConfigConverter;
import com.miao.toolbox.tool.scheduler.converter.TargetConfigConverter;
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
 * 定时任务配置实体（scheduled_tasks 表，V33）。
 *
 * <p>{@code targetConfig} / {@code notifyConfig} 通过 AttributeConverter 与 JSON 列互转；
 * {@code @JdbcTypeCode(SqlTypes.JSON)} 使 Hibernate 期望 JSON 列类型
 * （dev/prod 的 ddl-auto=validate 校验通过），converter 在 Java 层完成对象↔字符串转换。
 * 敏感 header 值由 Service 层在持久化前加密（实体层不感知加解密）。
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

    /** 目标类型：HTTP / PRESET */
    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 16)
    private TargetType targetType;

    /** 目标配置（JSON 列，敏感 header 值已加密） */
    @JdbcTypeCode(SqlTypes.JSON)
    @Convert(converter = TargetConfigConverter.class)
    @Column(name = "target_config", nullable = false)
    private TaskTargetConfig targetConfig;

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

    /** 单次执行超时（秒） */
    @Column(name = "timeout_seconds", nullable = false)
    @Default
    private Integer timeoutSeconds = 30;

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
