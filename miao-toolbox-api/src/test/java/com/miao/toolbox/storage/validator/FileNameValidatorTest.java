package com.miao.toolbox.storage.validator;

import com.miao.toolbox.storage.exception.StorageException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("FileNameValidator 单元测试")
class FileNameValidatorTest {

    private FileNameValidator validator;

    @BeforeEach
    void setUp() {
        validator = new FileNameValidator();
    }

    @Nested
    @DisplayName("合法文件名")
    class ValidFileNames {

        @Test
        @DisplayName("普通英文文件名")
        void normalFileName() {
            assertThat(validator.validate("report.pdf")).isEqualTo("report.pdf");
        }

        @Test
        @DisplayName("中文文件名")
        void chineseFileName() {
            assertThat(validator.validate("报告.pdf")).isEqualTo("报告.pdf");
        }

        @Test
        @DisplayName("含空格的文件名")
        void fileNameWithSpaces() {
            assertThat(validator.validate("my report.pdf")).isEqualTo("my report.pdf");
        }

        @Test
        @DisplayName("含多个点的文件名")
        void fileNameWithMultipleDots() {
            assertThat(validator.validate("archive.tar.gz")).isEqualTo("archive.tar.gz");
        }

        @ParameterizedTest
        @CsvSource({
                "photo.jpg, photo.jpg",
                "文档.docx, 文档.docx",
                "data-2026.csv, data-2026.csv",
                "my file.txt, my file.txt"
        })
        @DisplayName("各种合法文件名")
        void variousValidNames(String input, String expected) {
            assertThat(validator.validate(input)).isEqualTo(expected);
        }
    }

    @Nested
    @DisplayName("非法字符清洗")
    class Sanitization {

        @Test
        @DisplayName("剥离斜杠")
        void stripSlashes() {
            assertThat(validator.validate("path/to/file.txt")).isEqualTo("path_to_file.txt");
        }

        @Test
        @DisplayName("剥离反斜杠")
        void stripBackslashes() {
            assertThat(validator.validate("path\\to\\file.txt")).isEqualTo("path_to_file.txt");
        }

        @Test
        @DisplayName("剥离双点路径遍历")
        void stripDoubleDots() {
            // ../../etc/passwd → _/__etc/passwd (..→_) → ____etc_passwd (/→_)
            assertThat(validator.validate("../../etc/passwd")).isEqualTo("____etc_passwd");
        }

        @Test
        @DisplayName("剥离前导点号")
        void stripLeadingDots() {
            assertThat(validator.validate(".bashrc")).isEqualTo("bashrc");
        }

        @Test
        @DisplayName("剥离多个前导点号")
        void stripMultipleLeadingDots() {
            // ..hidden → _hidden (..→_), 前导点号已无
            assertThat(validator.validate("..hidden")).isEqualTo("_hidden");
        }

        @Test
        @DisplayName("混合非法字符")
        void mixedIllegalChars() {
            // ../\secret → _/\secret (..→_) → __\secret (/→_) → ___secret (\→_)
            assertThat(validator.validate("../\\secret")).isEqualTo("___secret");
        }
    }

    @Nested
    @DisplayName("长度截断")
    class Truncation {

        @Test
        @DisplayName("超过 255 字符截断")
        void truncateTo255() {
            String longName = "a".repeat(300) + ".txt";
            String result = validator.validate(longName);
            assertThat(result).hasSize(255);
        }

        @Test
        @DisplayName("恰好 255 字符不截断")
        void exact255NotTruncated() {
            String name255 = "a".repeat(251) + ".txt";
            assertThat(validator.validate(name255)).isEqualTo(name255);
        }
    }

    @Nested
    @DisplayName("空值和空白")
    class NullAndBlank {

        @Test
        @DisplayName("null 抛出异常")
        void nullThrows() {
            assertThatThrownBy(() -> validator.validate(null))
                    .isInstanceOf(StorageException.class)
                    .extracting("code").isEqualTo("FILE_NAME_INVALID");
        }

        @Test
        @DisplayName("空字符串抛出异常")
        void emptyThrows() {
            assertThatThrownBy(() -> validator.validate(""))
                    .isInstanceOf(StorageException.class);
        }

        @Test
        @DisplayName("纯空白抛出异常")
        void blankThrows() {
            assertThatThrownBy(() -> validator.validate("   "))
                    .isInstanceOf(StorageException.class);
        }

        @Test
        @DisplayName("清洗后为空抛出异常")
        void sanitizedEmptyThrows() {
            // 只有前导点号，清洗后为空
            // "." → 无 .. → 前导 . 剥离得 "" → 空
            assertThatThrownBy(() -> validator.validate("."))
                    .isInstanceOf(StorageException.class);
        }
    }

    @Nested
    @DisplayName("目录名校验")
    class DirectoryName {

        @Test
        @DisplayName("合法目录名")
        void validDirectoryName() {
            assertThat(validator.validateDirectoryName("docs")).isEqualTo("docs");
        }

        @Test
        @DisplayName("中文目录名")
        void chineseDirectoryName() {
            assertThat(validator.validateDirectoryName("文档")).isEqualTo("文档");
        }

        @Test
        @DisplayName("含路径遍历的目录名被清洗")
        void pathTraversalDirectoryName() {
            // ../secret → _/secret (..→_) → __secret (/→_)
            assertThat(validator.validateDirectoryName("../secret")).isEqualTo("__secret");
        }
    }
}
