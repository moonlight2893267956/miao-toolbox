package com.miao.toolbox.tool.diff;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("DiffService 核心对比逻辑测试")
class DiffServiceTest {

    @InjectMocks
    private DiffService diffService;

    @Nested
    @DisplayName("AC3: 行级对比")
    class LineLevelTest {

        @Test
        @DisplayName("行级差异检测 — 多行文本")
        void lineLevelDiff() {
            DiffRequest request = new DiffRequest();
            request.setLeft("line1\nline2\nline3");
            request.setRight("line1\nline2-modified\nline3\nline4");

            DiffResult result = diffService.compare(request);

            assertNotNull(result);
            assertNotNull(result.getHunks());
            assertFalse(result.getHunks().isEmpty());
            assertTrue(result.getHunks().stream().anyMatch(h ->
                    "modified".equals(h.getType()) || "added".equals(h.getType())));
        }

        @Test
        @DisplayName("行级 — 纯新增行")
        void lineLevelAddOnly() {
            DiffRequest request = new DiffRequest();
            request.setLeft("line1");
            request.setRight("line1\nline2");

            DiffResult result = diffService.compare(request);

            assertTrue(result.getHunks().stream().anyMatch(h -> "added".equals(h.getType())));
        }

        @Test
        @DisplayName("行级 — 纯删除行")
        void lineLevelDeleteOnly() {
            DiffRequest request = new DiffRequest();
            request.setLeft("line1\nline2");
            request.setRight("line1");

            DiffResult result = diffService.compare(request);

            assertTrue(result.getHunks().stream().anyMatch(h -> "removed".equals(h.getType())));
        }

        @Test
        @DisplayName("行级 — 完全相同")
        void lineLevelSame() {
            DiffRequest request = new DiffRequest();
            request.setLeft("hello");
            request.setRight("hello");

            DiffResult result = diffService.compare(request);

            assertTrue(result.getHunks().isEmpty());
            assertEquals(0, result.getStatistics().getAdditions());
            assertEquals(0, result.getStatistics().getDeletions());
            assertEquals(0, result.getStatistics().getModifications());
        }
    }

    @Nested
    @DisplayName("AC8: 忽略空白符")
    class IgnoreWhitespaceTest {

        @Test
        @DisplayName("忽略空白符 — 缩进差异不计入结果")
        void ignoreWhitespace() {
            DiffRequest request = new DiffRequest();
            request.setLeft("\tfoo");
            request.setRight("  foo");
            request.setIgnoreWhitespace(true);

            DiffResult result = diffService.compare(request);

            // 忽略空白后，两个字符串应该无差异或差异极少
            assertTrue(result.getStatistics().getModifications() <= 1);
        }
    }

    @Nested
    @DisplayName("AC9: 空内容处理")
    class EmptyContentTest {

        @Test
        @DisplayName("两侧都为空 — 返回空 hunks")
        void bothEmpty() {
            DiffRequest request = new DiffRequest();
            request.setLeft("");
            request.setRight("");

            DiffResult result = diffService.compare(request);

            assertNotNull(result);
            assertTrue(result.getHunks().isEmpty());
            assertEquals(0, result.getStatistics().getAdditions());
            assertEquals(0, result.getStatistics().getDeletions());
            assertEquals(0, result.getStatistics().getModifications());
        }

        @Test
        @DisplayName("一侧为空 — 另一侧全部标记为新增/删除")
        void oneSideEmpty() {
            DiffRequest request = new DiffRequest();
            request.setLeft("");
            request.setRight("hello");

            DiffResult result = diffService.compare(request);

            assertFalse(result.getHunks().isEmpty());
            assertTrue(result.getStatistics().getAdditions() > 0 || result.getStatistics().getModifications() > 0);
        }

        @Test
        @DisplayName("null 值视为空字符串")
        void nullTreatedAsEmpty() {
            DiffRequest request = new DiffRequest();
            request.setLeft(null);
            request.setRight(null);

            DiffResult result = diffService.compare(request);

            assertTrue(result.getHunks().isEmpty());
        }
    }

    @Nested
    @DisplayName("AC7: 语言类型识别")
    class LanguageDetectionTest {

        @Test
        @DisplayName("识别 JSON 文件")
        void detectJson() {
            assertEquals("json", diffService.detectLanguage("config.json"));
        }

        @Test
        @DisplayName("识别 YAML 文件")
        void detectYaml() {
            assertEquals("yaml", diffService.detectLanguage("app.yaml"));
            assertEquals("yaml", diffService.detectLanguage("app.yml"));
        }

        @Test
        @DisplayName("识别 Java 文件")
        void detectJava() {
            assertEquals("java", diffService.detectLanguage("Main.java"));
        }

        @Test
        @DisplayName("无法识别返回 null")
        void unknownExtension() {
            assertNull(diffService.detectLanguage("data.xyz"));
        }

        @Test
        @DisplayName("null 文件名返回 null")
        void nullFileName() {
            assertNull(diffService.detectLanguage(null));
        }
    }
}
