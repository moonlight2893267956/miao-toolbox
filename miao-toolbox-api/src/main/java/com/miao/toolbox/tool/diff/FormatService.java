package com.miao.toolbox.tool.diff;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.nio.charset.StandardCharsets;
import java.util.Map;

import com.github.vertical_blank.sqlformatter.SqlFormatter;

@Slf4j
@Service
public class FormatService {

    private static final long MAX_FORMAT_BYTES = 1L * 1024L * 1024L; // 1MB

    private static final Formatter JAVA_FORMATTER = new Formatter();

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
        String text = req.getText() == null ? "" : req.getText();
        String language = req.getLanguage();

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
                    "Java 源码语法错误：" + e.getMessage(), 400);
        } catch (RuntimeException e) {
            // snakeyaml YAMLException / sql-formatter / jsoup 异常
            log.warn("Format error ({}): {}", language, e.getMessage());
            throw new BusinessException(ErrorCode.DIFF_FORMAT_ERROR,
                    "格式化失败：" + safeMessage(e), 400);
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
        return JAVA_FORMATTER.formatSource(text);
    }

    private String formatJson(String text) throws JsonProcessingException {
        if (text.isEmpty()) return "";
        JsonNode node = jsonMapper.readTree(text);
        if (node.isMissingNode()) return "";
        return jsonMapper.writerWithDefaultPrettyPrinter().writeValueAsString(node);
    }

    @SuppressWarnings("unchecked")
    private String formatYaml(String text) {
        Object loaded = yaml.load(text);
        if (loaded == null) return "";
        return yaml.dump(loaded);
    }

    private String formatSql(String text) {
        return SqlFormatter.format(text);
    }

    private String formatXml(String text) {
        Document doc = Jsoup.parse(text, "", Parser.xmlParser());
        doc.outputSettings().prettyPrint(true).indentAmount(2);
        return doc.outerHtml();
    }

    private String formatHtml(String text) {
        Document doc = Jsoup.parse(text);
        doc.outputSettings().prettyPrint(true).indentAmount(2);
        return doc.html();
    }

    private String formatCss(String text) {
        // jsoup 1.18.x 不支持 CSS parser；简单分行：每条规则前保留原样 + 缩进
        // 对于 v1 兜底：原文 + 行内多空白压缩为单空格，避免极端情况下的视觉混乱
        return text.replaceAll("[ \\t]+", " ").trim();
    }

    // === 工具方法 ===

    private String formatErrorMessage(String language, String originalMessage, String location) {
        StringBuilder sb = new StringBuilder();
        sb.append("源码语法错误");
        if (location != null) {
            sb.append(" (").append(location).append(")");
        }
        sb.append("：").append(originalMessage == null ? "未知" : originalMessage);
        return sb.toString();
    }

    private String safeMessage(Exception e) {
        String m = e.getMessage();
        return m == null ? e.getClass().getSimpleName() : m;
    }
}
