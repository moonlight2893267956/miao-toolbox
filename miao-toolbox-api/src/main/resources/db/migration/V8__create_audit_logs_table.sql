-- V8: Create audit_logs table
CREATE TABLE audit_logs (
    id                BIGINT        NOT NULL AUTO_INCREMENT,
    user_id           BIGINT        NOT NULL,
    tool_id           VARCHAR(50)   NOT NULL,
    request_summary   TEXT,
    response_status   VARCHAR(20)   NOT NULL,
    duration_ms       INT,
    token_consumption INT,
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_audit_user_id (user_id),
    INDEX idx_audit_tool_id (tool_id),
    INDEX idx_audit_status (response_status),
    INDEX idx_audit_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
