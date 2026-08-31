-- 下线「娱乐工具」模块：删除此前由 V25 写入的 TOOL_FUN 路由记录。
-- RouteSyncRunner 仅在路由定义缺失时插库、不会删除已有记录，故这里显式清理 DB 残留。
DELETE FROM routes WHERE code = 'TOOL_FUN';
