-- 通知中心：公告管理支持
-- 1. 添加 ANNOUNCEMENT 消息类型（无需 ALTER，type 是 VARCHAR）
-- 2. 添加 is_deleted 软删除标记
-- 3. 添加 edited_at 编辑时间

ALTER TABLE messages ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER updated_at;
ALTER TABLE messages ADD COLUMN edited_at DATETIME NULL AFTER is_deleted;
