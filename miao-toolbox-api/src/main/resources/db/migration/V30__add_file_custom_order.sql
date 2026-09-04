-- 文件自定义排序（Epic 5 补充：「自定义」排序模式，支持自由拖拽排序）
-- custom_order 为目录内的展示序号，越小越靠前；同目录维度独立编号

ALTER TABLE files
    ADD COLUMN custom_order INT NOT NULL DEFAULT 0 COMMENT '目录内自定义排序序号（越小越靠前）';

-- 存量数据以主键作为初始顺序，保证迁移后顺序稳定
UPDATE files SET custom_order = id;

-- 自定义排序查询走 (user_id, path, custom_order) 复合索引。
-- path 为 VARCHAR(1024) utf8mb4，整列入索引会超过 3072 字节上限，
-- 故用 255 字符前缀索引（等值查询仍可用，剩余部分由存储引擎回表校验）。
CREATE INDEX idx_files_user_path_order ON files (user_id, path(255), custom_order);
