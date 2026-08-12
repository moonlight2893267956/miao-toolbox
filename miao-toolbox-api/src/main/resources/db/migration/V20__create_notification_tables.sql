-- 通知中心：消息表
CREATE TABLE messages (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(200)   NOT NULL,
    content         TEXT           NOT NULL,
    type            VARCHAR(30)    NOT NULL DEFAULT 'SYSTEM',
    priority        VARCHAR(10)    NOT NULL DEFAULT 'NORMAL',
    sender_id       BIGINT         NULL,
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_messages_type (type),
    INDEX idx_messages_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 通知中心：消息接收人表（支持定向/全员广播）
CREATE TABLE message_recipients (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id      BIGINT         NOT NULL,
    user_id         BIGINT         NULL,           -- NULL 表示全员广播
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_msg_user (message_id, user_id),
    INDEX idx_mr_user_id (user_id),
    CONSTRAINT fk_mr_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 通知中心：消息已读记录表
CREATE TABLE message_reads (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id      BIGINT         NOT NULL,
    user_id         BIGINT         NOT NULL,
    read_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_read_msg_user (message_id, user_id),
    INDEX idx_mr_reads_user (user_id),
    CONSTRAINT fk_mread_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
