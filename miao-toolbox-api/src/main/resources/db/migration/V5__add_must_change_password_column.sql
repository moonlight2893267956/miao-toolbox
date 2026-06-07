-- V5: Add must_change_password column
-- CR修复：硬编码管理员密码添加首次登录强制修改机制
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE AFTER is_enabled;

-- 标记初始管理员账号必须修改密码
UPDATE users SET must_change_password = TRUE WHERE username = 'admin';
