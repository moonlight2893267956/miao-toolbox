-- V14: 注册 PHP 日志提取器路由并授予普通用户访问权限
-- 该工具已在前端路由(App.tsx)与 route-definitions.yml 中定义,
-- 但后端 routes/role_routes 此前未登记,导致路由管理页面不可见且普通用户被 RequireRoute 拦截。

-- 1. 插入路由定义(幂等;若 RouteSyncRunner 已先行插入则忽略)
INSERT IGNORE INTO routes (code, name, path, category, icon, sort_order, is_admin_route, is_enabled)
VALUES ('TOOL_PHP_LOG_EXTRACTOR', 'PHP 日志提取器', '/tools/php-log-extractor', 'tool', 'FileSearchOutlined', 8, FALSE, TRUE);

-- 2. 授予普通用户(USER)全部非管理员工具路由(幂等)
--    补全此前仅由 RouteSyncRunner 写入 routes 表、却未写入 role_routes 的工具路由
--    (如 translate/regex/cron/network 及本次的 php-log-extractor),符合 V12 设计意图。
INSERT IGNORE INTO role_routes (role_id, route_id)
SELECT r.id, rt.id
FROM roles r
CROSS JOIN routes rt
WHERE r.code = 'USER'
  AND rt.is_admin_route = FALSE;
