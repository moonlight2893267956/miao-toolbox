-- V10: 创建 ai_invocations 表（AI 调用记录，替代 audit_logs 中 AI 相关用途）
-- 设计决策：
--   - 废弃 tool_id，统一以 agent_name 为主键维度（Q4=B）
--   - 不引入 cost 字段（Q3=A，v1 只记 tokens）
--   - 与 audit_logs 互不重叠：前者管 AI 用量，后者管安全审计
--   - audit_logs.tool_id 列保留（兼容旧数据）但不再写入新值

CREATE TABLE ai_invocations (
    id                  BIGINT          NOT NULL AUTO_INCREMENT,
    request_id          VARCHAR(36)     NOT NULL,
    user_id             BIGINT          NOT NULL,
    agent_name          VARCHAR(64)     NOT NULL,
    model               VARCHAR(64),
    mode                VARCHAR(32),
    status              VARCHAR(16)     NOT NULL,
    error_code          VARCHAR(64),
    latency_ms          INT             NOT NULL,
    prompt_tokens       INT,
    completion_tokens   INT,
    total_tokens        INT,
    trace_id            VARCHAR(64),
    request_summary     VARCHAR(512),
    response_summary    VARCHAR(512),
    client_ip           VARCHAR(64),
    user_agent          VARCHAR(255),
    created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uk_request_id (request_id),
    INDEX idx_aiinv_user_created (user_id, created_at DESC),
    INDEX idx_aiinv_agent_created (agent_name, created_at DESC),
    INDEX idx_aiinv_created (created_at DESC),
    INDEX idx_aiinv_trace (trace_id),

    CONSTRAINT fk_aiinv_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AI 调用记录表 — 每次调用 miao-ai 的完整记录';
