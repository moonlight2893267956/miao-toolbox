-- 注册文本批量处理工具路由
INSERT IGNORE INTO routes (code, name, path, category, icon, sort_order, is_admin_route, is_enabled)
VALUES ('TOOL_TEXT_BATCH_PROCESSOR', '文本批量处理', '/tools/text-batch-processor', 'tool', 'FileTextOutlined', 11, FALSE, TRUE);

-- 授予 USER 角色所有非管理员路由的访问权限（幂等，与 V16/V25 相同模式）
INSERT IGNORE INTO role_routes (role_id, route_id)
SELECT r.id, rt.id
FROM roles r
CROSS JOIN routes rt
WHERE r.code = 'USER'
  AND rt.is_admin_route = FALSE;
