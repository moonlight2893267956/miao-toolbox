package com.miao.toolbox.tool.translate;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import com.miao.toolbox.tool.translate.dto.AiEnhanceRequest;
import com.miao.toolbox.tool.translate.dto.AiEnhanceResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 增强翻译服务（FR-16/FR-17，story-4.1）。
 *
 * <p>经 {@link MiaoAiClient} 调用 miao-ai 平台的 translate-agent，由其内部完成
 * 百度机器翻译 + LLM 润色/风格化/上下文连贯，toolbox 侧只透传文本与风格指令。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiEnhanceService {

    private static final String AGENT_KEY = "translate-agent";

    private final MiaoAiClient miaoAiClient;

    public AiEnhanceResponse enhance(AiEnhanceRequest request) {
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("task", request.getTask());
        input.put("text", request.getText());
        input.put("source_lang", request.getSourceLang());
        input.put("target_lang", request.getTargetLang());
        if (request.getTone() != null && !request.getTone().isBlank()) {
            input.put("tone", request.getTone());
        }
        // FR-17：上下文连贯翻译。仅在有前文时透传，供 agent 的 context 任务做术语/指代一致参考。
        if (request.getContext() != null && !request.getContext().isBlank()) {
            input.put("context", request.getContext());
        }

        MiaoAiInvokeResponse resp = miaoAiClient.invoke(AGENT_KEY, input, Map.of());
        Object rawOutput = resp.getOutput();
        if (!(rawOutput instanceof Map<?, ?>)) {
            throw new BusinessException("AI_ANALYSIS_FAILED", "翻译增强结果格式异常", 502);
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> output = (Map<String, Object>) rawOutput;
        if (output.get("translated") == null) {
            throw new BusinessException("AI_ANALYSIS_FAILED", "翻译增强结果为空", 502);
        }

        AiEnhanceResponse result = new AiEnhanceResponse();
        result.setTask((String) output.get("task"));
        result.setTranslated(String.valueOf(output.get("translated")));
        if (output.get("mt_draft") != null) {
            result.setMtDraft(String.valueOf(output.get("mt_draft")));
        }
        if (output.get("notes") != null) {
            result.setNotes(String.valueOf(output.get("notes")));
        }
        if (output.get("bilingual") instanceof List<?> list) {
            List<Map<String, String>> safeList = list.stream()
                    .filter(item -> item instanceof Map<?, ?>)
                    .map(item -> {
                        @SuppressWarnings("unchecked")
                        Map<String, String> casted = ((Map<String, Object>) item).entrySet().stream()
                                .collect(java.util.stream.Collectors.toMap(
                                        Map.Entry::getKey,
                                        e -> String.valueOf(e.getValue()),
                                        (a, b) -> b,
                                        LinkedHashMap::new
                                ));
                        return casted;
                    })
                    .toList();
            result.setBilingual(safeList);
        }
        return result;
    }
}
