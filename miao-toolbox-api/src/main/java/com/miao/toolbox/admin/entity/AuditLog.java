package com.miao.toolbox.admin.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "audit_logs")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "tool_id", nullable = false, length = 50)
    private String toolId;

    @Column(name = "request_summary", columnDefinition = "TEXT")
    private String requestSummary;

    @Column(name = "response_status", nullable = false, length = 20)
    private String responseStatus;

    @Column(name = "duration_ms")
    private Integer durationMs;

    @Column(name = "token_consumption")
    private Integer tokenConsumption;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
