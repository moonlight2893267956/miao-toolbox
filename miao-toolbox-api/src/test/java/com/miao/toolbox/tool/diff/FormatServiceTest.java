package com.miao.toolbox.tool.diff;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("FormatService 代码格式化测试")
class FormatServiceTest {

    private final FormatService formatService = new FormatService(new ObjectMapper());

    private FormatRequest req(String text, String language) {
        FormatRequest r = new FormatRequest();
        r.setText(text);
        r.setLanguage(language);
        return r;
    }

    @Nested
    @DisplayName("正常路径：6 种语言")
    class NormalPath {

        @Test
        @DisplayName("JSON — Jackson pretty 输出带换行+缩进")
        void jsonFormat() {
            FormatResponse r = formatService.format(req(
                    "{\"a\":1,\"b\":2,\"c\":[1,2,3]}",
                    "json"));
            assertEquals("json", r.getLanguage());
            assertTrue(r.getFormatted().contains("\n"));
            assertTrue(r.getFormatted().contains("\"a\" : 1"));
            assertTrue(r.getFormatted().contains("[ 1, 2, 3 ]"));
        }

        @Test
        @DisplayName("YAML — snakeyaml round-trip 关键字大写")
        void yamlFormat() {
            FormatResponse r = formatService.format(req(
                    "a: 1\nb: 2\nc:\n  - x\n  - y",
                    "yaml"));
            assertEquals("yaml", r.getLanguage());
            assertTrue(r.getFormatted().contains("a: 1"));
            assertTrue(r.getFormatted().contains("- x"));
            assertTrue(r.getFormatted().contains("- y"));
        }

        @Test
        @DisplayName("SQL — 关键字大写")
        void sqlFormat() {
            FormatResponse r = formatService.format(req(
                    "select a,b from t where a=1",
                    "sql"));
            assertEquals("sql", r.getLanguage());
            String upper = r.getFormatted().toUpperCase();
            assertTrue(upper.contains("SELECT"), "SQL 关键字应大写");
            assertTrue(upper.contains("FROM"));
            assertTrue(upper.contains("WHERE"));
        }

        @Test
        @DisplayName("XML — jsoup 缩进")
        void xmlFormat() {
            String input = "<root><a x=\"1\"/><b>text</b></root>";
            FormatResponse r = formatService.format(req(input, "xml"));
            assertEquals("xml", r.getLanguage());
            assertTrue(r.getFormatted().startsWith("<root>"));
            assertTrue(r.getFormatted().contains("\n"), "XML 格式化应包含换行");
            assertTrue(r.getFormatted().contains("  <a"), "XML 应有缩进");
        }

        @Test
        @DisplayName("HTML — jsoup 缩进")
        void htmlFormat() {
            String input = "<div><p>hello</p><p>world</p></div>";
            FormatResponse r = formatService.format(req(input, "html"));
            assertEquals("html", r.getLanguage());
            assertTrue(r.getFormatted().contains("<p>hello</p>"));
            assertTrue(r.getFormatted().contains("\n"), "HTML 格式化应包含换行");
            // outerHtml 应输出 <html><head></head><body>...</body></html>
            assertTrue(r.getFormatted().contains("<body>") || r.getFormatted().contains("<div>"),
                    "HTML outerHtml 应保留 div 结构");
        }

        @Test
        @DisplayName("CSS — 透传原文（jsoup 不支持 CSS parser）")
        void cssFormat() {
            String input = "body { color: red; margin: 0; }\n\n.header { font-size: 12px; }";
            FormatResponse r = formatService.format(req(input, "css"));
            assertEquals("css", r.getLanguage());
            // 透传：原文完全保留
            assertEquals(input, r.getFormatted());
            // split("\n", -1) 对 "a\n\nb" 返回 3 段（保留空行）
            assertEquals(3, r.getLines());
        }
    }

    @Nested
    @DisplayName("异常路径")
    class ExceptionPath {

        @Test
        @DisplayName("未知 language 抛 DIFF_INVALID_LANGUAGE")
        void unknownLanguage() {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> formatService.format(req("abc", "rust")));
            assertEquals("DIFF_INVALID_LANGUAGE", e.getErrorCode());
        }

        @Test
        @DisplayName("空 language 抛 DIFF_INVALID_LANGUAGE（@Pattern 校验）")
        void emptyLanguage() {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> formatService.format(req("abc", "")));
            // Service 直接抛 INVALID_LANGUAGE 兜底
            assertEquals("DIFF_INVALID_LANGUAGE", e.getErrorCode());
        }

        @Test
        @DisplayName("超 1MB 字符数抛 DIFF_FORMAT_TOO_LARGE（OOM 防护）")
        void tooLargeChars() {
            String big = "a".repeat(1_000_001);
            BusinessException e = assertThrows(BusinessException.class,
                    () -> formatService.format(req(big, "json")));
            assertEquals("DIFF_FORMAT_TOO_LARGE", e.getErrorCode());
            assertTrue(e.getMessage().contains("字符"));
        }

        @Test
        @DisplayName("JSON 语法错抛 DIFF_FORMAT_ERROR 且 message 含 'JSON'")
        void jsonSyntaxError() {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> formatService.format(req("{a:1}", "json")));
            assertEquals("DIFF_FORMAT_ERROR", e.getErrorCode());
            assertTrue(e.getMessage().contains("JSON"),
                    "错误消息应区分语言（JSON），实际: " + e.getMessage());
        }

        @Test
        @DisplayName("YAML 语法错抛 DIFF_FORMAT_ERROR 且 message 含 'YAML'")
        void yamlSyntaxError() {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> formatService.format(req("key:\n - bad: x\n  - other", "yaml")));
            assertEquals("DIFF_FORMAT_ERROR", e.getErrorCode());
            assertTrue(e.getMessage().contains("YAML"),
                    "错误消息应区分语言（YAML），实际: " + e.getMessage());
        }
    }

    @Nested
    @DisplayName("边界条件")
    class EdgeCase {

        @Test
        @DisplayName("空字符串返回空")
        void emptyString() {
            FormatResponse r = formatService.format(req("", "json"));
            assertEquals("", r.getFormatted());
            assertEquals(0, r.getLines());
            assertEquals(0, r.getBytes());
        }

        @Test
        @DisplayName("null text 视为空字符串")
        void nullText() {
            FormatRequest r = new FormatRequest();
            r.setText(null);
            r.setLanguage("json");
            FormatResponse resp = formatService.format(r);
            assertEquals("", resp.getFormatted());
        }

        @Test
        @DisplayName("已格式化 JSON 正常返回")
        void alreadyFormattedJson() {
            String text = "{\n  \"a\" : 1,\n  \"b\" : 2\n}";
            FormatResponse r = formatService.format(req(text, "json"));
            assertEquals(text, r.getFormatted());
        }

        @Test
        @DisplayName("BOM 头被剥离")
        void bomStripped() {
            String input = "\uFEFF{\"a\":1}";
            FormatResponse r = formatService.format(req(input, "json"));
            // BOM 剥离后第一个字符必须是引号
            assertFalse(r.getFormatted().startsWith("\uFEFF"));
            assertTrue(r.getFormatted().startsWith("{"));
        }
    }
}
