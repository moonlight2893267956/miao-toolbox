-- 注册娱乐工具路由
INSERT IGNORE INTO routes (code, name, path, category, icon, sort_order, is_admin_route, is_enabled)
VALUES ('TOOL_FUN', '娱乐工具', '/tools/fun', 'tool', 'SmileOutlined', 11, FALSE, TRUE);

-- 授予 USER 角色所有非管理员路由的访问权限（幂等）
INSERT IGNORE INTO role_routes (role_id, route_id)
SELECT r.id, rt.id
FROM roles r
CROSS JOIN routes rt
WHERE r.code = 'USER'
  AND rt.is_admin_route = FALSE;
