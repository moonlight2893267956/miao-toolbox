package com.miao.toolbox.tool.scheduler.converter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.exc.InvalidTypeIdException;
import com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * {@link TaskTargetConfig} 多态 JSON 持久化转换器。
 *
 * <p>序列化：Java 对象 → JSON 字符串（含 targetType 判别字段）；
 * 反序列化：JSON 字符串 → 按判别字段还原为 HttpTargetConfig / PresetTargetConfig。
 *
 * <p>设计说明：实体列不写 columnDefinition="json"——生产库 JSON 列由 Flyway（V33）管理，
 * 测试库（H2, ddl-auto=create-drop）由 Hibernate 按默认 varchar 建列，
 * converter 输出的 String 两种库均兼容写入。
 */
@Converter
public class TargetConfigConverter implements AttributeConverter<TaskTargetConfig, String> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(TaskTargetConfig attribute) {
        if (attribute == null) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(attribute);
        } catch (Exception e) {
            throw new IllegalArgumentException("任务目标配置序列化失败: " + e.getMessage(), e);
        }
    }

    @Override
    public TaskTargetConfig convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return null;
        }
        try {
            return MAPPER.readValue(dbData, TaskTargetConfig.class);
        } catch (InvalidTypeIdException e) {
            throw new IllegalArgumentException(
                    "任务目标配置 targetType 未知: " + e.getTypeId(), e);
        } catch (Exception e) {
            throw new IllegalArgumentException("任务目标配置反序列化失败: " + e.getMessage(), e);
        }
    }
}
