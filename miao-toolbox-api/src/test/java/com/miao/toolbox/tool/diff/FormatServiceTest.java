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
    @DisplayName("正常路径：7 种语言")
    class NormalPath {

        @Test
        @DisplayName("Java — google-java-format 真正格式化（缩进+换行）")
        void javaFormat() {
            String input = "class A{void m(){if(true){System.out.println(\"x\");}}}";
            FormatResponse r = formatService.format(req(input, "java"));
            assertEquals("java", r.getLanguage());
            // 格式化后必须含换行（紧凑输入被展开）
            assertTrue(r.getFormatted().contains("\n"),
                    "Java 格式化后应包含换行，实际: " + r.getFormatted());
            // 格式化后必须以 2 空格缩进
            assertTrue(r.getFormatted().matches("(?s).*\\n  .*"),
                    "Java 格式化后应使用 2 空格缩进，实际: " + r.getFormatted());
            // 格式化后行数应 > 1
            assertTrue(r.getLines() > 1, "Java 紧凑代码应被展开为多行");
        }

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
        @DisplayName("Java 源码语法错抛 DIFF_FORMAT_ERROR")
        void javaSyntaxError() {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> formatService.format(req("class { void m() }", "java")));
            assertEquals("DIFF_FORMAT_ERROR", e.getErrorCode());
            assertTrue(e.getMessage().contains("Java"));
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

        @Test
        @DisplayName("ThreadLocal 隔离：10 次并发调用结果一致")
        void threadLocalSafety() throws InterruptedException {
            String input = "class A{void m(){}}";
            int threads = 10;
            Thread[] ts = new Thread[threads];
            String[] results = new String[threads];
            Exception[] errors = new Exception[threads];
            for (int i = 0; i < threads; i++) {
                final int idx = i;
                ts[i] = new Thread(() -> {
                    try {
                        results[idx] = formatService.format(req(input, "java")).getFormatted();
                    } catch (Exception e) {
                        errors[idx] = e;
                    }
                });
            }
            for (Thread t : ts) t.start();
            for (Thread t : ts) t.join();
            for (Exception e : errors) {
                assertNull(e, "并发调用不应抛错: " + e);
            }
            for (String r : results) {
                assertEquals(results[0], r, "并发调用结果应一致");
            }
        }
    }
}
