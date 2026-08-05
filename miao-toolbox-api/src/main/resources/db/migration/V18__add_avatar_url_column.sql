-- 为用户表添加头像 URL 字段
ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) DEFAULT NULL AFTER google_username;
