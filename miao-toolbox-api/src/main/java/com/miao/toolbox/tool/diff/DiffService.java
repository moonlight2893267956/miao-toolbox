package com.miao.toolbox.tool.diff;

import com.github.difflib.DiffUtils;
import com.github.difflib.patch.AbstractDelta;
import com.github.difflib.patch.DeltaType;
import com.github.difflib.patch.Patch;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
public class DiffService {

    private static final int CHUNK_SIZE = 1_000_000; // 1MB
    private static final Pattern WORD_PATTERN = Pattern.compile("(\\s+|\\p{Punct}+)");

    /**
     * 执行文本对比
     */
    public DiffResult compare(DiffRequest request) {
        String left = request.getLeft() != null ? request.getLeft() : "";
        String right = request.getRight() != null ? request.getRight() : "";

        String granularity = request.getGranularity();

        // AC9: 空内容处理
        if (left.isEmpty() && right.isEmpty()) {
            return DiffResult.builder()
                    .granularity(granularity)
                    .statistics(DiffStatistics.builder().additions(0).deletions(0).modifications(0).build())
                    .hunks(Collections.emptyList())
                    .language(null)
                    .build();
        }

        // AC8: 忽略空白符预处理
        if (request.isIgnoreWhitespace()) {
            left = normalizeWhitespace(left);
            right = normalizeWhitespace(right);
        }

        // AC4: 大文件分 chunk 处理
        if (left.length() > CHUNK_SIZE || right.length() > CHUNK_SIZE) {
            return compareInChunks(left, right, granularity);
        }

        // 按粒度对比
        List<DiffHunk> hunks;
        switch (granularity) {
            case "char":
                hunks = compareCharLevel(left, right);
                break;
            case "word":
                hunks = compareWordLevel(left, right);
                break;
            case "line":
                hunks = compareLineLevel(left, right);
                break;
            default:
                throw new IllegalArgumentException("不支持的对比粒度: " + granularity);
        }

        // 计算统计
        DiffStatistics statistics = calculateStatistics(hunks);

        return DiffResult.builder()
                .granularity(granularity)
                .statistics(statistics)
                .hunks(hunks)
                .language(null)
                .build();
    }

    /**
     * AC1: 字符级对比
     */
    private List<DiffHunk> compareCharLevel(String left, String right) {
        List<String> leftChars = left.chars().mapToObj(c -> String.valueOf((char) c)).collect(Collectors.toList());
        List<String> rightChars = right.chars().mapToObj(c -> String.valueOf((char) c)).collect(Collectors.toList());

        if (leftChars.isEmpty()) leftChars = Collections.singletonList("");
        if (rightChars.isEmpty()) rightChars = Collections.singletonList("");

        Patch<String> patch = DiffUtils.diff(leftChars, rightChars);
        return buildHunksFromPatch(patch, leftChars, rightChars);
    }

    /**
     * AC2: 词级对比
     */
    private List<DiffHunk> compareWordLevel(String left, String right) {
        List<String> leftWords = splitIntoWords(left);
        List<String> rightWords = splitIntoWords(right);

        if (leftWords.isEmpty()) leftWords = Collections.singletonList("");
        if (rightWords.isEmpty()) rightWords = Collections.singletonList("");

        Patch<String> patch = DiffUtils.diff(leftWords, rightWords);
        return buildHunksFromPatch(patch, leftWords, rightWords);
    }

    /**
     * AC3: 行级对比
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
     * AC4: 大文件分 chunk 对比
     */
    private DiffResult compareInChunks(String left, String right, String granularity) {
        List<DiffHunk> allHunks = new ArrayList<>();
        int offset = 0;

        while (offset < Math.max(left.length(), right.length())) {
            String leftChunk = safeSubstring(left, offset, offset + CHUNK_SIZE);
            String rightChunk = safeSubstring(right, offset, offset + CHUNK_SIZE);

            List<DiffHunk> chunkHunks;
            switch (granularity) {
                case "char":
                    chunkHunks = compareCharLevel(leftChunk, rightChunk);
                    break;
                case "word":
                    chunkHunks = compareWordLevel(leftChunk, rightChunk);
                    break;
                case "line":
                    chunkHunks = compareLineLevel(leftChunk, rightChunk);
                    break;
                default:
                    chunkHunks = compareLineLevel(leftChunk, rightChunk);
            }

            // 调整行号偏移
            for (DiffHunk hunk : chunkHunks) {
                allHunks.add(DiffHunk.builder()
                        .type(hunk.getType())
                        .oldStart(hunk.getOldStart() + offset)
                        .oldLines(hunk.getOldLines())
                        .newStart(hunk.getNewStart() + offset)
                        .newLines(hunk.getNewLines())
                        .changes(hunk.getChanges())
                        .build());
            }

            offset += CHUNK_SIZE;
        }

        DiffStatistics statistics = calculateStatistics(allHunks);
        return DiffResult.builder()
                .granularity(granularity)
                .statistics(statistics)
                .hunks(allHunks)
                .language(null)
                .build();
    }

    /**
     * AC7: 根据文件扩展名识别语言类型
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

    private List<String> splitIntoWords(String text) {
        if (text == null || text.isEmpty()) return Collections.singletonList("");
        String[] tokens = WORD_PATTERN.split(text);
        List<String> words = new ArrayList<>();
        int pos = 0;
        for (String token : tokens) {
            if (!token.isEmpty()) {
                // 添加分隔符
                if (pos > 0) words.add(" ");
                words.add(token);
                pos++;
            }
        }
        if (words.isEmpty()) words.add(text);
        return words;
    }

    private String normalizeWhitespace(String text) {
        return text.replaceAll("[ \\t]+", " ").replaceAll("\\n\\s+\\n", "\n\n").trim();
    }

    private String safeSubstring(String s, int start, int end) {
        if (s == null || start >= s.length()) return "";
        end = Math.min(end, s.length());
        return s.substring(start, end);
    }
}
