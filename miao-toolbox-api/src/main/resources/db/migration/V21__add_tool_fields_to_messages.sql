-- 通知中心：工具结果预留字段
ALTER TABLE messages
    ADD COLUMN tool_id             VARCHAR(50)  NULL     AFTER sender_id,
    ADD COLUMN tool_operation_id   VARCHAR(100) NULL     AFTER tool_id;

CREATE INDEX idx_messages_tool_id ON messages(tool_id);
