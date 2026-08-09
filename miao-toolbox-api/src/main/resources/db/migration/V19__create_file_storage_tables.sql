-- ============================================================
-- V19: 文件存储服务 — 数据库表结构
-- 包含：files、directories、file_shares 表 + users 表扩展
-- ============================================================

-- -----------------------------------------------------------
-- 1. files 表 — 用户文件元数据
--    utf8mb4 下 VARCHAR(1024) = 4096 字节，超过 InnoDB 3072 字节索引上限
--    因此对长 VARCHAR 列使用前缀索引
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT       NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    path            VARCHAR(1024) NOT NULL DEFAULT '',
    cos_key         VARCHAR(1024) NOT NULL,
    size_bytes      BIGINT       NOT NULL,
    mime_type       VARCHAR(128),
    cos_etag        VARCHAR(64),
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_files_user_path (user_id, path(191), file_name),
    INDEX idx_files_user_id (user_id),
    UNIQUE INDEX idx_files_cos_key (cos_key(768)),

    CONSTRAINT fk_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 2. directories 表 — 用户目录结构
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS directories (
    id           BIGINT       AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT       NOT NULL,
    name         VARCHAR(255) NOT NULL,
    path         VARCHAR(1024) NOT NULL,
    parent_path  VARCHAR(1024) NOT NULL DEFAULT '',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX idx_dirs_user_path (user_id, path(766)),
    INDEX idx_dirs_user_parent (user_id, parent_path(766)),

    CONSTRAINT fk_dirs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 3. file_shares 表 — 文件共享关系
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_shares (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    file_id             BIGINT       NOT NULL,
    shared_with_user_id BIGINT       NOT NULL,
    permission          ENUM('VIEW','EDIT') NOT NULL DEFAULT 'VIEW',
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX idx_shares_unique (file_id, shared_with_user_id),
    INDEX idx_shares_shared_with (shared_with_user_id),

    CONSTRAINT fk_shares_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    CONSTRAINT fk_shares_user FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 4. users 表扩展 — 存储配额字段
-- -----------------------------------------------------------
ALTER TABLE users
    ADD COLUMN storage_quota_bytes BIGINT NOT NULL DEFAULT 1073741824 COMMENT '存储配额（字节），默认1GB',
    ADD COLUMN storage_used_bytes  BIGINT NOT NULL DEFAULT 0 COMMENT '已用存储（字节）';
