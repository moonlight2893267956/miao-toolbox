-- ============================================================
-- V29: 文件外链分享表
-- 对应 PRD §4.12（FR-18 ~ FR-21）/ Epic 4
-- 说明：本表与 file_shares（站内用户间共享）语义完全隔离，
--       file_shares 表示「用户 → 用户」的站内共享，
--       file_share_links 表示「链接码 + 提取码」的对外公开分享。
-- ============================================================

CREATE TABLE IF NOT EXISTS file_share_links (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    share_code        VARCHAR(32)   NOT NULL COMMENT '链接码，URL 路径片段 /s/{shareCode}',
    file_id           BIGINT        NOT NULL COMMENT '被分享的文件',
    user_id           BIGINT        NOT NULL COMMENT '分享者',
    access_code_hash  VARCHAR(128)  NOT NULL COMMENT '提取码 BCrypt 哈希，禁止存储明文',
    expires_at        DATETIME      NULL     COMMENT '失效时间，NULL 表示永久有效',
    max_visits        INT           NULL     COMMENT '访问次数上限，NULL 表示不限次数',
    visit_count       INT           NOT NULL DEFAULT 0 COMMENT '已访问次数（仅在提取码校验成功时累加）',
    revoked           TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否已手动取消：0=否 1=是',
    created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_share_code (share_code),
    INDEX idx_share_link_file (file_id),
    INDEX idx_share_link_user (user_id),

    CONSTRAINT fk_share_link_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    CONSTRAINT fk_share_link_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
