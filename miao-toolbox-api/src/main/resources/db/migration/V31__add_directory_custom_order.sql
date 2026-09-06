-- 目录自定义排序（Story 5.12 补充：文件夹与文件一样支持自由拖拽排序）
-- custom_order 为父目录内的展示序号，越小越靠前；同父目录维度独立编号。
-- 与 V30（files.custom_order）同构，目录与文件各自独立编号。

ALTER TABLE directories
    ADD COLUMN custom_order INT NOT NULL DEFAULT 0 COMMENT '父目录内自定义排序序号（越小越靠前）';

-- 存量数据以主键作为初始顺序，保证迁移后顺序稳定
UPDATE directories SET custom_order = id;

-- 自定义排序查询走 (user_id, parent_path, custom_order) 复合索引。
-- parent_path 为 VARCHAR(1024) utf8mb4（4 字节/字符），整列/长前缀都会超过
-- InnoDB 3072 字节上限：本索引为三列，user_id(8) + prefix*4 + custom_order(4) 须 ≤ 3072，
-- 故前缀取 255（1020 字节），与 V30（files 表同类索引 path(255)）保持一致。
-- 注意：不能用 V19 建表时的 766 前缀——那是两列索引的极限，再加上 custom_order 会超限。
CREATE INDEX idx_dirs_user_parent_order ON directories (user_id, parent_path(255), custom_order);
