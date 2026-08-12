-- 通知中心：消息隐藏（dismiss）表
-- 用户删除消息仅对当前用户不可见，不影响其他用户
CREATE TABLE message_dismissals (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id  BIGINT       NOT NULL,
    user_id     BIGINT       NOT NULL,
    dismissed_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_message_user (message_id, user_id),
    KEY idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
