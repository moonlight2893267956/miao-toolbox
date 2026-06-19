package com.miao.toolbox.tool.diff;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("FormatService 代码格式化测试")
class FormatServiceTest {

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private FormatService formatService;

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
        @DisplayName("Java — google-java-format")
        void javaFormat() {
            FormatResponse r = formatService.format(req(
                    "class A{void m(){if(true){System.out.println(\"x\");}}}",
                    "java"));
            assertNotNull(r.getFormatted());
            assertEquals("java", r.getLanguage());
            assertTrue(r.getFormatted().contains("class A"));
            assertTrue(r.getLines() > 0);
            assertTrue(r.getBytes() > 0);
        }

        @Test
        @DisplayName("JSON — Jackson pretty")
        void jsonFormat() {
            FormatResponse r = formatService.format(req(
                    "{\"a\":1,\"b\":2,\"c\":[1,2,3]}",
                    "json"));
            assertEquals("json", r.getLanguage());
            assertTrue(r.getFormatted().contains("\"a\" : 1"));
            assertTrue(r.getFormatted().contains("\n"));
        }

        @Test
        @DisplayName("YAML — snakeyaml round-trip")
        void yamlFormat() {
            FormatResponse r = formatService.format(req(
                    "a: 1\nb: 2\nc:\n  - x\n  - y",
                    "yaml"));
            assertEquals("yaml", r.getLanguage());
            assertTrue(r.getFormatted().contains("a: 1"));
            assertTrue(r.getFormatted().contains("c:"));
        }

        @Test
        @DisplayName("SQL — vertical-blank")
        void sqlFormat() {
            FormatResponse r = formatService.format(req(
                    "select a,b from t where a=1",
                    "sql"));
            assertEquals("sql", r.getLanguage());
            assertTrue(r.getFormatted().toUpperCase().contains("SELECT"));
            assertTrue(r.getFormatted().toUpperCase().contains("FROM"));
        }

        @Test
        @DisplayName("XML — jsoup")
        void xmlFormat() {
            FormatResponse r = formatService.format(req(
                    "<root><a x=\"1\"/><b>text</b></root>",
                    "xml"));
            assertEquals("xml", r.getLanguage());
            assertTrue(r.getFormatted().startsWith("<root>"));
        }

        @Test
        @DisplayName("HTML — jsoup")
        void htmlFormat() {
            FormatResponse r = formatService.format(req(
                    "<div><p>hello</p><p>world</p></div>",
                    "html"));
            assertEquals("html", r.getLanguage());
            assertTrue(r.getFormatted().contains("hello"));
        }

        @Test
        @DisplayName("CSS — 兜底实现（去多余空白）")
        void cssFormat() {
            FormatResponse r = formatService.format(req(
                    "body   {  color: red;   margin: 0; }",
                    "css"));
            assertEquals("css", r.getLanguage());
            assertFalse(r.getFormatted().contains("  "));
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
        @DisplayName("超 1MB 抛 DIFF_FORMAT_TOO_LARGE")
        void tooLarge() {
            String big = "a".repeat(1024 * 1024 + 1);
            BusinessException e = assertThrows(BusinessException.class,
                    () -> formatService.format(req(big, "json")));
            assertEquals("DIFF_FORMAT_TOO_LARGE", e.getErrorCode());
        }

        @Test
        @DisplayName("JSON 语法错抛 DIFF_FORMAT_ERROR")
        void jsonSyntaxError() {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> formatService.format(req("{a:1}", "json")));
            assertEquals("DIFF_FORMAT_ERROR", e.getErrorCode());
            assertTrue(e.getMessage().contains("语法"));
        }

        @Test
        @DisplayName("Java 源码语法错抛 DIFF_FORMAT_ERROR")
        void javaSyntaxError() {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> formatService.format(req("class { void m() }", "java")));
            assertEquals("DIFF_FORMAT_ERROR", e.getErrorCode());
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
    }
}
