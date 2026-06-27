-- V10: Create tools table
CREATE TABLE tools (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    tool_id         VARCHAR(50)   NOT NULL,
    name            VARCHAR(100)  NOT NULL,
    description     TEXT,
    icon            VARCHAR(50),
    ai_service_type VARCHAR(30)   NOT NULL DEFAULT 'BUILTIN_PROXY',
    route_path      VARCHAR(100),
    is_enabled      BOOLEAN       NOT NULL DEFAULT TRUE,
    config_yaml     TEXT,
    call_count      INT           NOT NULL DEFAULT 0,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_tools_tool_id (tool_id),
    INDEX idx_tools_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
