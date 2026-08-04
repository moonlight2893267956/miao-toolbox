-- V17: 添加 email_verified 列
ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 COMMENT '邮箱是否已验证';
