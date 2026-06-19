package com.miao.toolbox.tool.diff;

import com.github.difflib.DiffUtils;
import com.github.difflib.patch.AbstractDelta;
import com.github.difflib.patch.DeltaType;
import com.github.difflib.patch.Patch;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
public class DiffService {

    private static final int CHUNK_SIZE = 1_000_000; // 1MB

    /**
     * 执行文本对比（行级）
     */
    public DiffResult compare(DiffRequest request) {
        String left = request.getLeft() != null ? request.getLeft() : "";
        String right = request.getRight() != null ? request.getRight() : "";

        // 空内容处理
        if (left.isEmpty() && right.isEmpty()) {
            return DiffResult.builder()
                    .statistics(DiffStatistics.builder().additions(0).deletions(0).modifications(0).build())
                    .hunks(Collections.emptyList())
                    .language(null)
                    .build();
        }

        // 忽略空白符预处理
        if (request.isIgnoreWhitespace()) {
            left = normalizeWhitespace(left);
            right = normalizeWhitespace(right);
        }

        // 大文件分 chunk 处理
        if (left.length() > CHUNK_SIZE || right.length() > CHUNK_SIZE) {
            return compareInChunks(left, right);
        }

        // 结构化对比（JSON/YAML key-level diff）
        if (request.isStructuredDiff()) {
            String detectedLang = detectLanguageFromContent(left, right);
            if (detectedLang != null) {
                List<DiffHunk> hunks = compareStructured(left, right, detectedLang);
                DiffStatistics statistics = calculateStatistics(hunks);
                return DiffResult.builder()
                        .statistics(statistics)
                        .hunks(hunks)
                        .language(detectedLang)
                        .build();
            }
        }

        // 行级对比
        List<DiffHunk> hunks = compareLineLevel(left, right);
        DiffStatistics statistics = calculateStatistics(hunks);

        return DiffResult.builder()
                .statistics(statistics)
                .hunks(hunks)
                .language(null)
                .build();
    }

    /**
     * 行级对比
     */
    private List<DiffHunk> compareLineLevel(String left, String right) {
        List<String> leftLines = Arrays.asList(left.split("\n", -1));
        List<String> rightLines = Arrays.asList(right.split("\n", -1));

        // 去掉末尾空行（split 产生）
        if (leftLines.size() > 1 && leftLines.getLast().isEmpty()) {
            leftLines = leftLines.subList(0, leftLines.size() - 1);
        }
        if (rightLines.size() > 1 && rightLines.getLast().isEmpty()) {
            rightLines = rightLines.subList(0, rightLines.size() - 1);
        }

        if (leftLines.isEmpty()) leftLines = Collections.singletonList("");
        if (rightLines.isEmpty()) rightLines = Collections.singletonList("");

        Patch<String> patch = DiffUtils.diff(leftLines, rightLines);
        return buildHunksFromPatch(patch, leftLines, rightLines);
    }

    /**
     * 大文件分 chunk 对比
     * 按换行符对齐切割，避免在行中间截断导致错误 diff
     */
    private DiffResult compareInChunks(String left, String right) {
        List<String> leftLines = new ArrayList<>(Arrays.asList(left.split("\n", -1)));
        List<String> rightLines = new ArrayList<>(Arrays.asList(right.split("\n", -1)));
        if (leftLines.size() > 1 && leftLines.getLast().isEmpty()) leftLines.removeLast();
        if (rightLines.size() > 1 && rightLines.getLast().isEmpty()) rightLines.removeLast();

        int linesPerChunk = CHUNK_SIZE / 80; // 估算：每行约 80 字符
        List<DiffHunk> allHunks = new ArrayList<>();
        int lineOffset = 0;

        while (lineOffset < Math.max(leftLines.size(), rightLines.size())) {
            List<String> leftChunk = leftLines.subList(lineOffset, Math.min(lineOffset + linesPerChunk, leftLines.size()));
            List<String> rightChunk = rightLines.subList(lineOffset, Math.min(lineOffset + linesPerChunk, rightLines.size()));

            Patch<String> patch = DiffUtils.diff(leftChunk, rightChunk);
            List<DiffHunk> chunkHunks = buildHunksFromPatch(patch, leftChunk, rightChunk);

            // 调整行号偏移
            for (DiffHunk hunk : chunkHunks) {
                allHunks.add(DiffHunk.builder()
                        .type(hunk.getType())
                        .oldStart(hunk.getOldStart() + lineOffset)
                        .oldLines(hunk.getOldLines())
                        .newStart(hunk.getNewStart() + lineOffset)
                        .newLines(hunk.getNewLines())
                        .changes(hunk.getChanges())
                        .build());
            }

            lineOffset += linesPerChunk;
        }

        DiffStatistics statistics = calculateStatistics(allHunks);
        return DiffResult.builder()
                .statistics(statistics)
                .hunks(allHunks)
                .language(null)
                .build();
    }

    // ========== 结构化对比（JSON/YAML key-level diff） ==========

    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    /**
     * 从内容检测结构化语言类型
     */
    private String detectLanguageFromContent(String left, String right) {
        if (isJson(left) || isJson(right)) return "json";
        return null;
    }

    private boolean isJson(String text) {
        if (text == null || text.isBlank()) return false;
        try {
            JSON_MAPPER.readTree(text.trim());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 执行结构化对比（JSON key-level diff）
     */
    private List<DiffHunk> compareStructured(String left, String right, String lang) {
        try {
            JsonNode leftNode = JSON_MAPPER.readTree(left.trim());
            JsonNode rightNode = JSON_MAPPER.readTree(right.trim());

            List<String> leftPaths = new ArrayList<>();
            List<String> rightPaths = new ArrayList<>();
            flattenJson("$", leftNode, leftPaths);
            flattenJson("$", rightNode, rightPaths);

            // 将路径列表转为 diff 行
            Patch<String> patch = DiffUtils.diff(leftPaths, rightPaths);
            return buildHunksFromPatch(patch, leftPaths, rightPaths);
        } catch (Exception e) {
            log.warn("Structured diff failed, falling back: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 将 JSON 节点展平为路径列表（每个路径对应一个 key）
     */
    private void flattenJson(String prefix, JsonNode node, List<String> paths) {
        if (node.isObject()) {
            Iterator<String> fieldNames = node.fieldNames();
            while (fieldNames.hasNext()) {
                String field = fieldNames.next();
                String path = prefix + "." + field;
                JsonNode child = node.get(field);
                if (child.isObject() || child.isArray()) {
                    paths.add("[object] " + path);
                    flattenJson(path, child, paths);
                } else {
                    paths.add(path + " = " + child.asText());
                }
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                String path = prefix + "[" + i + "]";
                JsonNode child = node.get(i);
                if (child.isObject() || child.isArray()) {
                    paths.add("[object] " + path);
                    flattenJson(path, child, paths);
                } else {
                    paths.add(path + " = " + child.asText());
                }
            }
        }
    }

    /**
     * 根据文件扩展名识别语言类型
     */
    public String detectLanguage(String fileName) {
        if (fileName == null) return null;
        String ext = fileName.lastIndexOf('.') >= 0
                ? fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase()
                : "";
        return switch (ext) {
            case "json" -> "json";
            case "yaml", "yml" -> "yaml";
            case "java" -> "java";
            case "py" -> "python";
            case "js", "jsx" -> "javascript";
            case "ts", "tsx" -> "typescript";
            case "css" -> "css";
            case "html" -> "html";
            case "xml" -> "xml";
            case "md" -> "markdown";
            case "sql" -> "sql";
            case "sh" -> "bash";
            case "properties" -> "properties";
            case "conf" -> "conf";
            default -> null;
        };
    }

    // === Private helpers ===

    private List<DiffHunk> buildHunksFromPatch(Patch<String> patch, List<String> left, List<String> right) {
        List<DiffHunk> hunks = new ArrayList<>();

        for (AbstractDelta<String> delta : patch.getDeltas()) {
            DeltaType type = delta.getType();
            int oldStart = delta.getSource().getPosition();
            int oldLines = delta.getSource().getLines().size();
            int newStart = delta.getTarget().getPosition();
            int newLines = delta.getTarget().getLines().size();

            String typeStr = switch (type) {
                case INSERT -> "added";
                case DELETE -> "removed";
                case CHANGE -> "modified";
                default -> "unchanged";
            };

            List<DiffChange> changes = new ArrayList<>();

            if (type == DeltaType.INSERT) {
                for (String line : delta.getTarget().getLines()) {
                    changes.add(DiffChange.builder().type("added").value(line).build());
                }
            } else if (type == DeltaType.DELETE) {
                for (String line : delta.getSource().getLines()) {
                    changes.add(DiffChange.builder().type("removed").value(line).build());
                }
            } else if (type == DeltaType.CHANGE) {
                int maxLen = Math.max(oldLines, newLines);
                for (int i = 0; i < maxLen; i++) {
                    String oldVal = i < oldLines ? delta.getSource().getLines().get(i) : null;
                    String newVal = i < newLines ? delta.getTarget().getLines().get(i) : null;
                    if (oldVal != null && newVal != null) {
                        changes.add(DiffChange.builder().type("modified").value(newVal).oldValue(oldVal).build());
                    } else if (newVal != null) {
                        changes.add(DiffChange.builder().type("added").value(newVal).build());
                    } else {
                        changes.add(DiffChange.builder().type("removed").value(oldVal).build());
                    }
                }
            }

            hunks.add(DiffHunk.builder()
                    .type(typeStr)
                    .oldStart(oldStart + 1) // 转为 1-based
                    .oldLines(oldLines)
                    .newStart(newStart + 1)
                    .newLines(newLines)
                    .changes(changes)
                    .build());
        }

        return hunks;
    }

    private DiffStatistics calculateStatistics(List<DiffHunk> hunks) {
        int additions = 0, deletions = 0, modifications = 0;
        for (DiffHunk hunk : hunks) {
            switch (hunk.getType()) {
                case "added" -> additions++;
                case "removed" -> deletions++;
                case "modified" -> modifications++;
            }
        }
        return DiffStatistics.builder()
                .additions(additions)
                .deletions(deletions)
                .modifications(modifications)
                .build();
    }

    private String normalizeWhitespace(String text) {
        return text.replaceAll("\\r\\n", "\n")
                .replaceAll("[ \\t]+", " ")
                .replaceAll("\\n\\s+\\n", "\n\n")
                .trim();
    }
}
