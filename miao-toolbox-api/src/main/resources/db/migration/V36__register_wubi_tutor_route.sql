-- 注册五笔练习室路由（对普通用户开放）
INSERT IGNORE INTO routes (code, name, path, category, icon, sort_order, is_admin_route, is_enabled)
VALUES ('TOOL_WUBI_TUTOR', '五笔练习室', '/tools/wubi-tutor', 'tool', 'KeyOutlined', 13, FALSE, TRUE);

-- 授予 USER 角色所有非管理员路由的访问权限（幂等，与 V16/V27/V33 相同模式）
INSERT IGNORE INTO role_routes (role_id, route_id)
SELECT r.id, rt.id
FROM roles r
CROSS JOIN routes rt
WHERE r.code = 'USER'
  AND rt.is_admin_route = FALSE;
