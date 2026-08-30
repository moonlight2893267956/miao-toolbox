-- 文本批量处理工具更名为「文本清洗台」
-- 仅更新显示名，不改变路由 code / path / 权限
UPDATE routes
SET name = '文本清洗台'
WHERE code = 'TOOL_TEXT_BATCH_PROCESSOR'
  AND name = '文本批量处理';
