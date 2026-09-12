package com.miao.toolbox.tool.scheduler.converter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * {@link NotifyConfig} JSON 持久化转换器。
 *
 * <p>生产 JSON 列由 Flyway 管理，测试库由 Hibernate 按默认 varchar 建列，String 输出两者兼容。
 */
@Converter
public class NotifyConfigConverter implements AttributeConverter<NotifyConfig, String> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(NotifyConfig attribute) {
        if (attribute == null) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(attribute);
        } catch (Exception e) {
            throw new IllegalArgumentException("通知配置序列化失败: " + e.getMessage(), e);
        }
    }

    @Override
    public NotifyConfig convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return null;
        }
        try {
            return MAPPER.readValue(dbData, NotifyConfig.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("通知配置反序列化失败: " + e.getMessage(), e);
        }
    }
}
