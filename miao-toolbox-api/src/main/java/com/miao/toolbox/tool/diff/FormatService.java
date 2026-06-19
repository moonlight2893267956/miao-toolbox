package com.miao.toolbox.tool.diff;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.vertical_blank.sqlformatter.SqlFormatter;
import com.google.googlejavaformat.java.Formatter;
import com.google.googlejavaformat.java.FormatterException;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.parser.Parser;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.error.YAMLException;

import java.nio.charset.StandardCharsets;

@Slf4j
@Service
public class FormatService {

    /** 1MB 字符数上界（用于 OOM 防护预筛） */
    private static final int MAX_FORMAT_CHARS = 1_000_000;
    /** 1MB 字节数上界（UTF-8 编码后） */
    private static final long MAX_FORMAT_BYTES = 1L * 1024L * 1024L;
    /** UTF-8 BOM 字符 */
    private static final char BOM = '\uFEFF';

    /**
     * google-java-format 的 Formatter 实例非线程安全，使用 ThreadLocal 隔离。
     * 相比每次 new 节省了类加载与字段初始化开销。
     */
    private static final ThreadLocal<Formatter> JAVA_FORMATTER = ThreadLocal.withInitial(Formatter::new);

    private final ObjectMapper jsonMapper;
    private final Yaml yaml;

    public FormatService(ObjectMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setIndent(2);
        // indicator indent must be < indent
        options.setIndicatorIndent(1);
        options.setPrettyFlow(true);
        this.yaml = new Yaml(options);
    }

    /**
     * 入口：根据 language 分发到对应格式化器
     */
    public FormatResponse format(FormatRequest req) {
        String rawText = req.getText() == null ? "" : req.getText();
        String language = req.getLanguage();

        // 字符数预筛，避免 1GB+ 输入触发 OOM（在 getBytes 之前拦下）
        if (rawText.length() > MAX_FORMAT_CHARS) {
            throw new BusinessException(ErrorCode.DIFF_FORMAT_TOO_LARGE,
                    "格式化文本超过 1MB 上限（实际 " + rawText.length() + " 字符）", 400);
        }

        // 剥离 UTF-8 BOM（所有语言入口统一处理）
        String text = rawText;
        if (!text.isEmpty() && text.charAt(0) == BOM) {
            text = text.substring(1);
        }

        // 字节数二次校验（多字节字符场景）
        long sizeBytes = text.getBytes(StandardCharsets.UTF_8).length;
        if (sizeBytes > MAX_FORMAT_BYTES) {
            throw new BusinessException(ErrorCode.DIFF_FORMAT_TOO_LARGE,
                    "格式化文本超过 1MB 上限（实际 " + sizeBytes + " 字节）", 400);
        }

        String formatted;
        try {
            formatted = switch (language) {
                case "java" -> formatJava(text);
                case "json" -> formatJson(text);
                case "yaml" -> formatYaml(text);
                case "sql" -> formatSql(text);
                case "xml" -> formatXml(text);
                case "html" -> formatHtml(text);
                case "css" -> formatCss(text);
                default -> throw new BusinessException(ErrorCode.DIFF_INVALID_LANGUAGE,
                        "不支持的格式化语言: " + language, 400);
            };
        } catch (BusinessException e) {
            throw e;
        } catch (JsonProcessingException e) {
            log.warn("Format error ({}): {}", language, e.getOriginalMessage());
            throw new BusinessException(ErrorCode.DIFF_FORMAT_ERROR,
                    formatErrorMessage(language, e.getOriginalMessage(), e.getLocation() == null ? null : e.getLocation().toString()),
                    400);
        } catch (FormatterException e) {
            log.warn("Format error ({}): {}", language, e.getMessage());
            throw new BusinessException(ErrorCode.DIFF_FORMAT_ERROR,
                    friendlyFormatError(language), 400);
        } catch (YAMLException e) {
            log.warn("Format error ({}): {}", language, e.getMessage());
            throw new BusinessException(ErrorCode.DIFF_FORMAT_ERROR,
                    friendlyFormatError(language), 400);
        } catch (RuntimeException e) {
            log.warn("Format error ({}): {}", language, e.getMessage());
            throw new BusinessException(ErrorCode.DIFF_FORMAT_ERROR,
                    friendlyFormatError(language), 400);
        }

        long bytes = formatted.getBytes(StandardCharsets.UTF_8).length;
        int lines = formatted.isEmpty() ? 0 : formatted.split("\n", -1).length;

        return FormatResponse.builder()
                .formatted(formatted)
                .language(language)
                .lines(lines)
                .bytes(bytes)
                .build();
    }

    // === 各语言实现 ===

    private String formatJava(String text) throws FormatterException {
        return JAVA_FORMATTER.get().formatSource(text);
    }

    private String formatJson(String text) throws JsonProcessingException {
        if (text.isEmpty()) return "";
        JsonNode node = jsonMapper.readTree(text);
        if (node.isMissingNode()) return "";
        return jsonMapper.writerWithDefaultPrettyPrinter().writeValueAsString(node);
    }

    private String formatYaml(String text) {
        Object loaded = yaml.load(text);
        if (loaded == null) return "";
        return yaml.dump(loaded);
    }

    private String formatSql(String text) {
        return SqlFormatter.format(text);
    }

    private String formatXml(String text) {
        // jsoup xmlParser 对不闭合标签会抛 InvalidMarkupException（RuntimeException 兜底接住）
        Document doc = Jsoup.parse(text, "", Parser.xmlParser());
        doc.outputSettings().prettyPrint(true).indentAmount(2);
        return doc.outerHtml();
    }

    private String formatHtml(String text) {
        Document doc = Jsoup.parse(text);
        doc.outputSettings().prettyPrint(true).indentAmount(2);
        return doc.outerHtml();
    }

    /**
     * CSS 透传：jsoup 1.18.x 不支持 CSS parser，复杂 CSS 格式化由前端 Prettier 接管。
     * 这里仅做轻量清洗（去 BOM 由入口统一处理），返回原文。
     */
    private String formatCss(String text) {
        return text;
    }

    // === 工具方法 ===

    private String formatErrorMessage(String language, String originalMessage, String location) {
        log.warn("Format error details ({}): message={}, location={}", language, originalMessage, location);
        return friendlyFormatError(language);
    }

    private String friendlyFormatError(String language) {
        String label = switch (language) {
            case "json" -> "JSON";
            case "yaml" -> "YAML";
            case "sql" -> "SQL";
            case "xml" -> "XML";
            case "html" -> "HTML";
            case "css" -> "CSS";
            case "java" -> "Java";
            default -> "代码";
        };
        return label + " 片段不完整或语法有误，请检查后再试";
    }

    private String safeMessage(Exception e) {
        String m = e.getMessage();
        return m == null ? e.getClass().getSimpleName() : m;
    }
}
