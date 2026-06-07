-- 为用户管理添加最后登录时间字段
ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL AFTER updated_at;
