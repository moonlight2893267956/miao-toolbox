package com.miao.toolbox.tool.jsonworkbench;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.observability.MiaoAiClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * JSON 工作台 REST API。
 *
 * <p>Story 3.2: AI 格式修复 — 接收损坏 JSON，调用 miao-ai Agent 返回修复建议。
 */
@Slf4j
@RestController
@RequestMapping("/api/json-workbench")
@RequireRoute("TOOL_JSON_WORKBENCH")
@RequiredArgsConstructor
public class JsonWorkbenchController {

    /** json-repairer agent key，对应 YAML 中 miao.ai.agents 下的 key */
    private static final String AGENT_KEY = "json-repairer";

    private final MiaoAiClient aiClient;
    private final ObjectMapper objectMapper;

    @PostMapping("/ai-repair")
    public ResponseEntity<Map<String, Object>> aiRepair(@RequestBody Map<String, String> body) {
        String jsonText = body.getOrDefault("jsonText", "");
        if (jsonText.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "jsonText 不能为空"));
        }

        try {
            var input = Map.<String, Object>of("json_text", jsonText);
            var metadata = Map.<String, Object>of("tool", "json-workbench", "action", "ai-repair");
            var response = aiClient.invoke(AGENT_KEY, input, metadata);
            var output = response.getOutput();

            // 从 agent 返回的 { "repaired": "..." } 中提取修复后 JSON
            String repaired;
            if (output instanceof String) {
                repaired = (String) output;
            } else if (output instanceof Map) {
                repaired = (String) ((Map<?, ?>) output).get("repaired");
            } else {
                repaired = objectMapper.writeValueAsString(output);
            }

            if (repaired == null || repaired.isBlank()) {
                return ResponseEntity.internalServerError().body(Map.of("error", "AI 返回结果为空"));
            }

            // 验证返回的确实是合法 JSON；兼容 AI 在 JSON 前后加少量说明/注释的情况。
            repaired = normalizeJsonCandidate(repaired);
            objectMapper.readTree(repaired);

            return ResponseEntity.ok(Map.of("repaired", repaired));
        } catch (Exception e) {
            log.error("AI 修复失败", e);
            String msg = e.getMessage() != null ? e.getMessage() : "AI 修复服务异常";
            if (msg.contains("配额") || msg.contains("quota") || msg.contains("额度")) {
                return ResponseEntity.status(429).body(Map.of("error", "AI 额度已用完"));
            }
            return ResponseEntity.internalServerError().body(Map.of("error", msg));
        }
    }

    private String normalizeJsonCandidate(String text) {
        String normalized = stripMarkdownFence(text == null ? "" : text.trim());
        String extracted = extractBalancedJson(normalized);
        return extracted != null ? extracted : normalized;
    }

    private String stripMarkdownFence(String text) {
        if (!text.startsWith("```")) {
            return text;
        }
        String[] lines = text.split("\\R", -1);
        if (lines.length <= 1) {
            return text;
        }
        int end = lines.length;
        while (end > 1 && lines[end - 1].trim().matches("`{2,3}")) {
            end--;
        }
        return String.join("\n", java.util.Arrays.copyOfRange(lines, 1, end)).trim();
    }

    private String extractBalancedJson(String text) {
        int start = -1;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '{' || ch == '[') {
                start = i;
                break;
            }
        }
        if (start < 0) {
            return null;
        }

        java.util.ArrayDeque<Character> stack = new java.util.ArrayDeque<>();
        boolean inString = false;
        boolean escaped = false;

        for (int i = start; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (ch == '\\') {
                    escaped = true;
                } else if (ch == '"') {
                    inString = false;
                }
                continue;
            }

            if (ch == '"') {
                inString = true;
            } else if (ch == '{') {
                stack.push('}');
            } else if (ch == '[') {
                stack.push(']');
            } else if (ch == '}' || ch == ']') {
                if (stack.isEmpty() || ch != stack.peek()) {
                    return null;
                }
                stack.pop();
                if (stack.isEmpty()) {
                    return text.substring(start, i + 1).trim();
                }
            }
        }

        return null;
    }
}
