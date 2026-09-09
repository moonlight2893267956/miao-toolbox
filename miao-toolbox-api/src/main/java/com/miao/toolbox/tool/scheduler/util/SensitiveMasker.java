package com.miao.toolbox.tool.scheduler.util;

/**
 * 敏感值脱敏工具（FR-14）。
 *
 * <p>两个场景、两种掩码：
 * <ul>
 *   <li>{@link #maskFull} — API 响应中的敏感字段占位（固定 {@code ****}），
 *       前端以此判断"未修改、保留原值"</li>
 *   <li>{@link #maskPartial} — 执行记录摘要中的敏感值（前 4 后 4 + 星号），
 *       便于人工辨识是哪个密钥，1.3 执行引擎使用</li>
 * </ul>
 */
public final class SensitiveMasker {

    private static final String FULL_MASK = "****";

    private SensitiveMasker() {
    }

    /** API 响应占位：固定 {@code ****}。null 原样返回。 */
    public static String maskFull(String value) {
        return value == null ? null : FULL_MASK;
    }

    /** 执行记录摘要：前 4 后 4 + 星号；长度不足 8 全掩码；null 原样返回。 */
    public static String maskPartial(String value) {
        if (value == null) {
            return null;
        }
        if (value.length() <= 8) {
            return FULL_MASK;
        }
        return value.substring(0, 4) + FULL_MASK + value.substring(value.length() - 4);
    }
}
