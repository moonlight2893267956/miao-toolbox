-- ============================================================
-- V37: 五笔练习室「挑战」成绩表（wubi-challenge-modes-and-leaderboard）
-- ============================================================
-- wubi_challenge_scores: 挑战三件套（限时冲刺 / 生存挑战 / 每日挑战）的成绩提交记录
--
-- 设计取舍：**只建一张「提交表」，不建「最佳表 + 历史表」**。
--   - 总榜 = 每用户历史最佳（按 score 取最大，同分看准确率/用时）
--   - 日榜 = 当天每用户最佳（stat_date 过滤后再取每人最佳）
--   两张表要处理双写一致性，而自托管规模下一条聚合查询完全够用。
-- 表增长由应用层「每用户每模式只保留最近 100 条」裁剪控制（见 Repository.trimOldScores）。
--
-- 本轮明确不做反作弊：接受客户端上报，仅在服务端做上限约束，不让脏数据入库。

CREATE TABLE IF NOT EXISTS wubi_challenge_scores (
    id               BIGINT      NOT NULL AUTO_INCREMENT,
    user_id          BIGINT      NOT NULL COMMENT '提交用户 ID（关联 users.id）',
    mode             VARCHAR(16) NOT NULL COMMENT '挑战模式：SPRINT / SURVIVAL / DAILY',
    score            INT         NOT NULL COMMENT '得分（口径见前端 challenge.ts，唯一事实来源）',
    correct_chars    INT         NOT NULL DEFAULT 0 COMMENT '正确打出的汉字数',
    accuracy_percent INT         NOT NULL DEFAULT 0 COMMENT '准确率（0~100 整数）',
    duration_sec     INT         NOT NULL DEFAULT 0 COMMENT '本次用时（秒）',
    max_combo        INT         NOT NULL DEFAULT 0 COMMENT '本次最高连击',
    stat_date        DATE        NOT NULL COMMENT '归属日期（本地时区，日榜按此过滤）',
    created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '提交时间',

    PRIMARY KEY (id),
    -- 总榜：mode 过滤 + score 排序（MySQL 8 可反向扫描，故降序由查询决定）
    INDEX idx_wubi_chal_mode_score (mode, score),
    -- 日榜：mode + 当天 + score
    INDEX idx_wubi_chal_mode_date_score (mode, stat_date, score),
    -- 我的成绩 / 裁剪：按用户 + 模式取最近记录
    INDEX idx_wubi_chal_user_mode_created (user_id, mode, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='五笔练习室挑战成绩（限时冲刺 / 生存挑战 / 每日挑战）';
