-- 注册 RAL 日志解析器路由
INSERT IGNORE INTO routes (code, name, path, category, icon, sort_order, is_admin_route, is_enabled)
VALUES ('TOOL_RAL_LOG_PARSER', 'RAL 日志解析器', '/tools/ral-log-parser', 'tool', 'BugOutlined', 9, FALSE, TRUE);

-- 同步更名：PHP 日志提取器 → 收银台日志提取器
UPDATE routes SET name = '收银台日志提取器' WHERE code = 'TOOL_PHP_LOG_EXTRACTOR' AND name = 'PHP 日志提取器';

-- 授予 USER 角色所有非管理员路由的访问权限（幂等）
INSERT IGNORE INTO role_routes (role_id, route_id)
SELECT r.id, rt.id
FROM roles r
CROSS JOIN routes rt
WHERE r.code = 'USER'
  AND rt.is_admin_route = FALSE;
