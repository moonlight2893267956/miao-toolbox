-- ============================================================
-- V33: 定时任务调度执行模块（epic-task-scheduler, ts-1-1）
-- ============================================================
-- scheduled_tasks:     定时任务配置（目标 JSON + 调度 + 重试 + 通知）
-- task_executions:     任务执行记录（每次触发一条，含请求/响应摘要）
-- routes:              注册 TOOL_TASK_SCHEDULER 路由（仅超级管理员可见，
--                      按 PRD FR-12 默认关闭策略——不授予 USER 角色）

-- ------------------------------------------------------------
-- 1. 定时任务表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    name            VARCHAR(50)  NOT NULL COMMENT '任务名称',
    description     VARCHAR(200) NULL     COMMENT '描述',
    target_type     VARCHAR(16)  NOT NULL COMMENT '目标类型：HTTP / PRESET',
    target_config   JSON         NOT NULL COMMENT '目标配置（敏感 header 值已 AES-GCM 加密）',
    cron_expression VARCHAR(120) NOT NULL COMMENT 'cron 表达式（5/6 位）',
    timezone        VARCHAR(40)  NOT NULL DEFAULT 'Asia/Shanghai' COMMENT '调度时区',
    valid_from      DATETIME(3)  NULL     COMMENT '生效起始时间',
    valid_until     DATETIME(3)  NULL     COMMENT '生效结束时间（超过后自动暂停）',
    status          VARCHAR(16)  NOT NULL DEFAULT 'ENABLED' COMMENT '状态：ENABLED / PAUSED',
    retry_count     INT          NOT NULL DEFAULT 0 COMMENT '失败重试次数（0-5）',
    retry_interval  INT          NOT NULL DEFAULT 60 COMMENT '重试间隔（秒）',
    timeout_seconds INT          NOT NULL DEFAULT 30 COMMENT '单次执行超时（秒）',
    notify_config   JSON         NULL     COMMENT '通知配置（webhook/email + 触发条件）',
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    INDEX idx_sched_tasks_status (status),
    INDEX idx_sched_tasks_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. 任务执行记录表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_executions (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    task_id          BIGINT       NOT NULL COMMENT '关联任务',
    trigger_type     VARCHAR(16)  NOT NULL COMMENT '触发类型：SCHEDULED / MANUAL',
    triggered_at     DATETIME(3)  NOT NULL COMMENT '触发时间',
    started_at       DATETIME(3)  NULL     COMMENT '开始执行时间（SKIPPED 为空）',
    finished_at      DATETIME(3)  NULL     COMMENT '结束时间',
    duration_ms      INT          NULL     COMMENT '耗时（毫秒）',
    status           VARCHAR(16)  NOT NULL COMMENT '状态：SUCCESS / FAILED / TIMEOUT / SKIPPED',
    retry_count      INT          NOT NULL DEFAULT 0 COMMENT '实际重试次数',
    request_summary  JSON         NULL     COMMENT '请求摘要（敏感 header 已脱敏）',
    response_summary JSON         NULL     COMMENT '响应摘要（响应体截断 4KB）',
    error_message    TEXT         NULL     COMMENT '错误信息',

    PRIMARY KEY (id),
    INDEX idx_task_exec_task_triggered (task_id, triggered_at DESC),
    INDEX idx_task_exec_status (status),
    CONSTRAINT fk_task_exec_tasks FOREIGN KEY (task_id)
        REFERENCES scheduled_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. 注册路由（默认关闭策略：不授予 USER 角色，仅超级管理员隐式通行）
-- ------------------------------------------------------------
INSERT IGNORE INTO routes (code, name, path, category, icon, sort_order, is_admin_route, is_enabled)
VALUES ('TOOL_TASK_SCHEDULER', '定时任务', '/tools/task-scheduler', 'tool', 'ClockCircleOutlined', 12, FALSE, TRUE);
