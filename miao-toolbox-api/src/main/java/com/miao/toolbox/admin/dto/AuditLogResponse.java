package com.miao.toolbox.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AuditLogResponse {

    private Long id;
    private Long userId;
    private String toolId;
    private String requestSummary;
    private String responseStatus;
    private Integer durationMs;
    private Integer tokenConsumption;
    private LocalDateTime createdAt;
}
