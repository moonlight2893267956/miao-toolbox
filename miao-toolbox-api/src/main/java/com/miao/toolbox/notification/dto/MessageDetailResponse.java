package com.miao.toolbox.notification.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MessageDetailResponse {

    private Long id;
    private String title;
    private String content;
    private String type;
    private String priority;
    private Long senderId;
    /** 工具 ID（v1 预留） */
    private String toolId;
    /** 工具操作 ID（v1 预留） */
    private String toolOperationId;
    private boolean read;
    private LocalDateTime readAt;
    private LocalDateTime createdAt;
}
