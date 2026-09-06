-- ============================================================
-- V32: 废纸篓机制（软删除）
-- ============================================================
-- 删除文件/目录改为软删除：deleted_at 标记进入废纸篓，配额保持占用；
-- 彻底删除（手动清除 / 30 天过期自动清理）时才物理删除并回退配额。
--
-- 目录迁移设计（关键）：
-- directories 有 UNIQUE (user_id, path) 索引，软删除目录时整棵子树
-- 的 path/parent_path 迁移到 "__trash/{dirId}/" 前缀下，
-- 释放原路径供新建同名目录；恢复时替换回原前缀。
-- "__trash" 为保留目录名，禁止用户创建（FileNameValidator 校验）。

ALTER TABLE files
    ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '废纸篓标记：NULL=正常，非空=删除时间',
    ADD INDEX idx_files_user_deleted (user_id, deleted_at);

ALTER TABLE directories
    ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '废纸篓标记：NULL=正常，非空=删除时间',
    ADD INDEX idx_directories_user_deleted (user_id, deleted_at);
