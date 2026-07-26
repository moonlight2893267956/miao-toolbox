-- 角色邀请令牌表：管理员为自定义角色生成邀请链接，用户持令牌注册后自动获得该角色
CREATE TABLE invite_tokens (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    role_id     BIGINT       NOT NULL,
    token_hash  VARCHAR(128) NOT NULL,
    created_by  BIGINT       NOT NULL,
    expires_at  TIMESTAMP    NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_invite_token_hash (token_hash),
    INDEX idx_invite_role_id (role_id),
    CONSTRAINT fk_invite_roles FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT fk_invite_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
