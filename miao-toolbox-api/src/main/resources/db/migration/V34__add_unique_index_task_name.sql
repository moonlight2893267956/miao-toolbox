-- ============================================================
-- V34: 定时任务名称唯一索引（ts-1-2 code review patch）
-- ============================================================
-- existsByName 应用层检查存在并发窗口，补数据层最终防线。
-- 单超管场景存量数据无重名（应用层已挡），加 UNIQUE 安全。

ALTER TABLE scheduled_tasks
    ADD UNIQUE INDEX uk_sched_tasks_name (name);
