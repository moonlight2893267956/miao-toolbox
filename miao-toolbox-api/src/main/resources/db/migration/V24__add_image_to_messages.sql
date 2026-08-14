-- 通知中心：消息配图支持
-- 1. 添加 image_cos_key 列（消息配图 COS key，NULL=无配图）
-- 图片对象存储于 COS messages/ 前缀下，不进 files 表，不占用户存储配额

ALTER TABLE messages ADD COLUMN image_cos_key VARCHAR(512) NULL COMMENT '消息配图 COS key' AFTER edited_at;
