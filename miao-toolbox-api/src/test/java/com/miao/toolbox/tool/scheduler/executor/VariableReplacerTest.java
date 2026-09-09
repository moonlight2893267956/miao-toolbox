package com.miao.toolbox.tool.scheduler.executor;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("VariableReplacer 变量替换")
class VariableReplacerTest {

    @DisplayName("替换全部三个内置变量")
    @Test
    void replacesAllVariables() {
        Map<String, String> vars = Map.of(
                "now", "2026-09-10T03:00:00",
                "taskName", "健康检查",
                "taskId", "42");

        String result = VariableReplacer.replace(
                "{\"time\":\"{{now}}\",\"task\":\"{{taskName}}\",\"id\":\"{{taskId}}\"}", vars);

        assertThat(result).isEqualTo("{\"time\":\"2026-09-10T03:00:00\",\"task\":\"健康检查\",\"id\":\"42\"}");
    }

    @DisplayName("同一变量多次出现全部替换")
    @Test
    void replacesRepeatedOccurrences() {
        Map<String, String> vars = Map.of("taskName", "清理");

        String result = VariableReplacer.replace("{{taskName}}-{{taskName}}-end", vars);

        assertThat(result).isEqualTo("清理-清理-end");
    }

    @DisplayName("未知变量原样保留")
    @Test
    void unknownVariableKeptAsIs() {
        Map<String, String> vars = Map.of("taskName", "t");

        String result = VariableReplacer.replace("{{unknown}} {{taskName}}", vars);

        assertThat(result).isEqualTo("{{unknown}} t");
    }

    @DisplayName("null/空模板与 null 变量值防御")
    @Test
    void nullAndEmptySafety() {
        assertThat(VariableReplacer.replace(null, Map.of("a", "b"))).isNull();
        assertThat(VariableReplacer.replace("", Map.of("a", "b"))).isEmpty();
        assertThat(VariableReplacer.replace("plain", null)).isEqualTo("plain");

        Map<String, String> withNullValue = new HashMap<>();
        withNullValue.put("v", null);
        assertThat(VariableReplacer.replace("x={{v}}", withNullValue)).isEqualTo("x=");
    }
}
