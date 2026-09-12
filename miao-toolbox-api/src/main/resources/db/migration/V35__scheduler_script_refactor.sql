-- ============================================================
-- V35: 定时任务脚本化重构（ts-3-1 / Story 1.1）
-- ============================================================
-- 1. 新增 scheduler_scripts 表：用户自定义脚本（Shell/Python）
-- 2. 新增 scheduler_script_versions 表：脚本版本（内容存 LONGTEXT）
-- 3. 改造 scheduled_tasks：移除 target_type/target_config，新增 script_id/script_version/params
-- 4. 清空旧 HTTP/PRESET 任务数据与执行记录（D-013 整体重做，无迁移价值）

-- ------------------------------------------------------------
-- 1. 脚本表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduler_scripts (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    name           VARCHAR(50)  NOT NULL COMMENT '脚本名称（全局唯一）',
    description    VARCHAR(200) NULL     COMMENT '描述',
    script_type    VARCHAR(16)  NOT NULL COMMENT 'SHELL / PYTHON',
    latest_version INT          NOT NULL DEFAULT 1 COMMENT '当前最新版本号',
    param_schema   JSON         NULL     COMMENT '参数 schema：[{name,type,default,desc}]',
    created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uk_sched_scripts_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. 脚本版本表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduler_script_versions (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    script_id    BIGINT       NOT NULL COMMENT '关联脚本',
    version      INT          NOT NULL COMMENT '版本号（自增，从 1 开始）',
    content      LONGTEXT     NOT NULL COMMENT '脚本内容（上限 64KB，应用层校验）',
    created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uk_script_version (script_id, version),
    INDEX idx_script_versions_script (script_id),
    CONSTRAINT fk_script_versions_script FOREIGN KEY (script_id)
        REFERENCES scheduler_scripts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. 改造 scheduled_tasks：移除 HTTP/PRESET 目标列，改为脚本引用
-- ------------------------------------------------------------
-- 先清空旧数据（外键依赖 task_executions → scheduled_tasks，需先删子表）
DELETE FROM task_executions;
DELETE FROM scheduled_tasks;

ALTER TABLE scheduled_tasks
    DROP COLUMN target_type,
    DROP COLUMN target_config,
    ADD COLUMN script_id      BIGINT NULL  COMMENT '关联脚本' AFTER description,
    ADD COLUMN script_version INT    NULL  COMMENT '绑定的脚本版本' AFTER script_id,
    ADD COLUMN params         JSON   NULL  COMMENT '参数值快照 {name: value}' AFTER script_version,
    ADD CONSTRAINT fk_sched_tasks_script FOREIGN KEY (script_id)
        REFERENCES scheduler_scripts(id) ON DELETE RESTRICT;

-- task_executions 列名保留，语义变更：
-- request_summary:  参数快照 {"params": {...}}
-- response_summary: {"exitCode": 0, "stdout": "...", "stderr": "...", "truncated": false}
-- （仅在应用层改变 JSON 内部结构，DDL 不变）
