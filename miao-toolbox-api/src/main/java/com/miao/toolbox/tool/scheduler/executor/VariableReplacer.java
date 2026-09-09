package com.miao.toolbox.tool.scheduler.executor;

import java.util.Map;

/**
 * 任务变量模板替换（FR-4）——统一入口，不支持嵌套变量。
 *
 * <p>内置变量（双花括号 + 小写驼峰）：
 * <ul>
 *   <li>{@code {{now}}} — 当前时间 ISO-8601（如 2026-09-10T03:00:00）</li>
 *   <li>{@code {{taskName}}} — 任务名</li>
 *   <li>{@code {{taskId}}} — 任务 ID</li>
 * </ul>
 */
public final class VariableReplacer {

    private VariableReplacer() {
    }

    /**
     * 替换模板中的全部变量。null/空模板原样返回；变量值为 null 时替换为空串。
     */
    public static String replace(String template, Map<String, String> variables) {
        if (template == null || template.isEmpty() || variables == null || variables.isEmpty()) {
            return template;
        }
        String result = template;
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            result = result.replace("{{" + entry.getKey() + "}}",
                    entry.getValue() == null ? "" : entry.getValue());
        }
        return result;
    }
}
