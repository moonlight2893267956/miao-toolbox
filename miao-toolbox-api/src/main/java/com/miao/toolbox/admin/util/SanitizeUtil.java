package com.miao.toolbox.admin.util;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * 脱敏工具：将请求摘要中敏感字段的值替换为 ***
 */
public final class SanitizeUtil {

    private SanitizeUtil() {}

    // 匹配 JSON "key": "value" / "key":"value" 或 query key=value 格式
    private static final Pattern SENSITIVE_PATTERN = Pattern.compile(
            "(?i)[\"']?(password|token|secret|key|authorization|cookie|api[_-]?key)[\"']?\\s*[:=]\\s*[\"']?([^\"'\\s,}]+)[\"']?"
    );

    private static final Set<String> SENSITIVE_WORDS = Set.of(
            "password", "token", "secret", "key", "authorization", "cookie", "api_key", "apikey"
    );

    /**
     * 对请求摘要进行脱敏处理
     */
    public static String sanitize(String input) {
        if (input == null || input.isEmpty()) {
            return input;
        }
        return SENSITIVE_PATTERN.matcher(input).replaceAll("\"$1\": ***");
    }

    /**
     * 判断是否包含敏感词
     */
    public static boolean containsSensitiveWord(String input) {
        if (input == null || input.isEmpty()) {
            return false;
        }
        String lower = input.toLowerCase();
        return SENSITIVE_WORDS.stream().anyMatch(lower::contains);
    }
}
