package com.miao.toolbox.tool.scheduler.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

/**
 * 任务执行记录实体（task_executions 表，V33）。
 *
 * <p>{@code taskId} 为裸外键（DB 层 fk_task_exec_tasks ON DELETE CASCADE 级联删除），
 * 与项目 {@code AiInvocation.userId} 同模式——JPA 不感知关联，避免删除时的多余 update。
 *
 * <p>{@code requestSummary} / {@code responseSummary} 为 JSON 文本（结构在执行引擎 Story 定稿），
 * {@code @JdbcTypeCode(SqlTypes.JSON)} 匹配生产 JSON 列（ddl-auto=validate 通过），
 * 敏感 header 已在上层脱敏后才写入。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "task_executions")
public class TaskExecution {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 关联任务 ID（DB 物理外键，级联删除） */
    @Column(name = "task_id", nullable = false)
    private Long taskId;

    /** 触发类型：SCHEDULED / MANUAL */
    @Enumerated(EnumType.STRING)
    @Column(name = "trigger_type", nullable = false, length = 16)
    private TriggerType triggerType;

    /** 触发时间（即本记录时间戳，无独立 created_at） */
    @Column(name = "triggered_at", nullable = false)
    private LocalDateTime triggeredAt;

    /** 开始执行时间（SKIPPED 记录为空） */
    @Column(name = "started_at")
    private LocalDateTime startedAt;

    /** 结束时间 */
    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    /** 耗时（毫秒） */
    @Column(name = "duration_ms")
    private Integer durationMs;

    /** 执行状态 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ExecutionStatus status;

    /** 实际重试次数 */
    @Column(name = "retry_count", nullable = false)
    private Integer retryCount;

    /** 请求摘要 JSON（method/url/headers 脱敏/bodyPreview） */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "request_summary")
    private String requestSummary;

    /** 响应摘要 JSON（statusCode/bodyPreview 截断 4KB） */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_summary")
    private String responseSummary;

    /** 错误信息 */
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
}
