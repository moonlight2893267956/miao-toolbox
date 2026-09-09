package com.miao.toolbox.tool.scheduler.entity;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * 任务目标配置（多态 JSON，存于 scheduled_tasks.target_config JSON 列）。
 *
 * <p>sealed 接口 + Jackson 类型判别：JSON 内携带 {@code targetType} 字段
 * （取值与 {@link TargetType} 枚举名一致），由 {@code TargetConfigConverter}
 * 反序列化时自动选择具体实现。数据库 target_type 列与 JSON 内 targetType 冗余但自洽：
 * 列用于 SQL 查询，JSON 内字段用于反序列化自包含。
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "targetType")
@JsonSubTypes({
        @JsonSubTypes.Type(value = HttpTargetConfig.class, name = "HTTP"),
        @JsonSubTypes.Type(value = PresetTargetConfig.class, name = "PRESET")
})
public sealed interface TaskTargetConfig permits HttpTargetConfig, PresetTargetConfig {
}
