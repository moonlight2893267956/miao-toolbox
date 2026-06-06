-- V1: Create users table
CREATE TABLE users (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    username      VARCHAR(20)  NOT NULL,
    password_hash VARCHAR(255)          DEFAULT NULL,
    email         VARCHAR(255)          DEFAULT NULL,
    role          ENUM('USER','ADMIN') NOT NULL DEFAULT 'USER',
    is_enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
    github_id     VARCHAR(255)          DEFAULT NULL,
    signing_key   VARCHAR(255)          DEFAULT NULL,
    login_fail_count INT       NOT NULL DEFAULT 0,
    locked_until  TIMESTAMP             DEFAULT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_users_username (username),
    UNIQUE INDEX idx_users_email (email),
    UNIQUE INDEX idx_users_github_id (github_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert first admin user (password: Admin123, bcrypt hash)
INSERT INTO users (username, password_hash, role, is_enabled)
VALUES ('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ADMIN', TRUE);
