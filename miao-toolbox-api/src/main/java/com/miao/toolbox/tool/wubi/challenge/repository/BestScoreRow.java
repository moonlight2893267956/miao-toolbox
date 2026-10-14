package com.miao.toolbox.tool.wubi.challenge.repository;

import java.time.LocalDateTime;

/**
 * 榜单行投影（每用户最佳那条记录）。
 *
 * <p>用接口投影而不是实体：窗口函数查询外层只取展示需要的列，
 * 避免把 {@code mode / stat_date} 等无用字段一起拖回来。
 * 字段名必须与 native query 里的列别名逐字一致。
 */
public interface BestScoreRow {

    Long getUserId();

    Integer getScore();

    Integer getAccuracyPercent();

    Integer getDurationSec();

    Integer getMaxCombo();

    LocalDateTime getCreatedAt();
}
