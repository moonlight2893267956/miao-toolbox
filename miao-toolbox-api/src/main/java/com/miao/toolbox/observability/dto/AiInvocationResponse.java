package com.miao.toolbox.observability.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 调用日志列表项 DTO。
 */
@Data
public class AiInvocationResponse {

    private Long id;
    private String requestId;
    private Long userId;
    private String username;
    private String agentName;
    private String model;
    private String mode;
    private String status;
    private String errorCode;
    private Integer latencyMs;
    private Integer promptTokens;
    private Integer completionTokens;
    private Integer totalTokens;
    private String traceId;
    private LocalDateTime createdAt;
}
