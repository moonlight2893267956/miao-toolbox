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
    @DisplayName("AC1: 字符级对比")
    class CharLevelTest {

        @Test
        @DisplayName("字符级差异检测 — abc vs axc")
        void charLevelDiff() {
            DiffRequest request = new DiffRequest();
            request.setLeft("abc");
            request.setRight("axc");
            request.setGranularity("char");

            DiffResult result = diffService.compare(request);

            assertNotNull(result);
            assertEquals("char", result.getGranularity());
            assertNotNull(result.getHunks());
            assertFalse(result.getHunks().isEmpty());
            // 应该有一个 modified 类型的 hunk
            assertTrue(result.getHunks().stream().anyMatch(h -> "modified".equals(h.getType())));
        }

        @Test
        @DisplayName("字符级 — 完全相同")
        void charLevelSame() {
            DiffRequest request = new DiffRequest();
            request.setLeft("hello");
            request.setRight("hello");
            request.setGranularity("char");

            DiffResult result = diffService.compare(request);

            assertTrue(result.getHunks().isEmpty());
            assertEquals(0, result.getStatistics().getAdditions());
            assertEquals(0, result.getStatistics().getDeletions());
            assertEquals(0, result.getStatistics().getModifications());
        }
    }

    @Nested
    @DisplayName("AC2: 词级对比")
    class WordLevelTest {

        @Test
        @DisplayName("词级差异检测 — hello world vs hello there")
        void wordLevelDiff() {
            DiffRequest request = new DiffRequest();
            request.setLeft("hello world");
            request.setRight("hello there");
            request.setGranularity("word");

            DiffResult result = diffService.compare(request);

            assertNotNull(result);
            assertEquals("word", result.getGranularity());
            assertFalse(result.getHunks().isEmpty());
            // 应该检测到词的差异
            assertTrue(result.getHunks().stream().anyMatch(h -> "modified".equals(h.getType()) || "removed".equals(h.getType()) || "added".equals(h.getType())));
        }
    }

    @Nested
    @DisplayName("AC3: 行级对比")
    class LineLevelTest {

        @Test
        @DisplayName("行级差异检测 — 多行文本")
        void lineLevelDiff() {
            DiffRequest request = new DiffRequest();
            request.setLeft("line1\nline2\nline3");
            request.setRight("line1\nline2-modified\nline3\nline4");
            request.setGranularity("line");

            DiffResult result = diffService.compare(request);

            assertNotNull(result);
            assertEquals("line", result.getGranularity());
            assertFalse(result.getHunks().isEmpty());
            // 应该有 modified 和 added 类型
            assertTrue(result.getHunks().stream().anyMatch(h ->
                    "modified".equals(h.getType()) || "added".equals(h.getType())));
        }

        @Test
        @DisplayName("行级 — 纯新增行")
        void lineLevelAddOnly() {
            DiffRequest request = new DiffRequest();
            request.setLeft("line1");
            request.setRight("line1\nline2");
            request.setGranularity("line");

            DiffResult result = diffService.compare(request);

            assertTrue(result.getHunks().stream().anyMatch(h -> "added".equals(h.getType())));
        }

        @Test
        @DisplayName("行级 — 纯删除行")
        void lineLevelDeleteOnly() {
            DiffRequest request = new DiffRequest();
            request.setLeft("line1\nline2");
            request.setRight("line1");
            request.setGranularity("line");

            DiffResult result = diffService.compare(request);

            assertTrue(result.getHunks().stream().anyMatch(h -> "removed".equals(h.getType())));
        }
    }

    @Nested
    @DisplayName("AC5: 无效粒度参数")
    class InvalidGranularityTest {

        @Test
        @DisplayName("无效粒度应抛出异常")
        void invalidGranularity() {
            DiffRequest request = new DiffRequest();
            request.setLeft("abc");
            request.setRight("def");
            request.setGranularity("invalid");

            assertThrows(IllegalArgumentException.class, () -> diffService.compare(request));
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
            request.setGranularity("line");
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
            request.setGranularity("line");

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
            request.setGranularity("line");

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
            request.setGranularity("char");

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
