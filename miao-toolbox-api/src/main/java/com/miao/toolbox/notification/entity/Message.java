package com.miao.toolbox.notification.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "messages")
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(nullable = false, length = 30)
    @Builder.Default
    private String type = "SYSTEM";

    @Column(nullable = false, length = 10)
    @Builder.Default
    private String priority = "NORMAL";

    @Column(name = "sender_id")
    private Long senderId;

    /** 工具 ID（v1 预留，工具结果消息关联的工具标识） */
    @Column(name = "tool_id", length = 50)
    private String toolId;

    /** 工具操作 ID（v1 预留，工具结果消息关联的操作标识） */
    @Column(name = "tool_operation_id", length = 100)
    private String toolOperationId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "is_deleted", nullable = false)
    @Builder.Default
    private Boolean deleted = false;

    @Column(name = "edited_at")
    private LocalDateTime editedAt;

    /** 消息配图 COS key（存于 COS messages/ 前缀下），NULL=无配图 */
    @Column(name = "image_cos_key", length = 512)
    private String imageCosKey;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    /**
     * 消息类型枚举
     */
    public static final String TYPE_SYSTEM = "SYSTEM";
    public static final String TYPE_TOOL = "TOOL";
    public static final String TYPE_SECURITY = "SECURITY";
    public static final String TYPE_ACCOUNT = "ACCOUNT";
    public static final String TYPE_ANNOUNCEMENT = "ANNOUNCEMENT";

    /**
     * 优先级枚举
     */
    public static final String PRIORITY_LOW = "LOW";
    public static final String PRIORITY_NORMAL = "NORMAL";
    public static final String PRIORITY_HIGH = "HIGH";
    public static final String PRIORITY_URGENT = "URGENT";
}
