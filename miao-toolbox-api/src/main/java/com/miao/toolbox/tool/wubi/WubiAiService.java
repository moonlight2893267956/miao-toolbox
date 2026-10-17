package com.miao.toolbox.tool.wubi;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 五笔拆字 AI 解释 / 追问的业务服务。
 *
 * <p>控制层只做转发，业务规则都在这里，且**不依赖任何 HTTP 对象**
 * （入参出参都是 {@code Map<String, Object>}），便于单测直接调用。
 *
 * <h3>校验分工</h3>
 * 这里只做「形」的校验（字段在不在、类型对不对、是否为空），**取值域校验留给 agent**：
 * 候选字根集在 agent 手上，在中间层重复实现一份只会变成两处需要同步的真相。
 *
 * <h3>会话生命周期</h3>
 * 首轮解释时若前端没带 {@code conversationId}，先建会话再把 id 随 metadata 发给 agent，
 * 并把平台回的 id / turn 附在响应上供前端下一轮带回。**建会话失败只降级为单轮，不阻断解释**
 * —— AI 是可选增强，这条纪律不能破。
 *
 * <h3>错误码语义</h3>
 * 上游状态码在这里被翻译成面向用户的语义：会话失效 410、并发占用 409、配额耗尽 429、
 * 上游不可用 503；其余错误码原样冒泡给全局异常处理器。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WubiAiService {

    /** wubi-explainer agent key，对应 Nacos 中 miao.ai.agents 下的 key */
    private static final String AGENT_KEY = "wubi-explainer";

    /** 工具标识，写入 metadata 供 ai_invocations / Langfuse 归类 */
    private static final String TOOL_NAME = "wubi-tutor";

    private final MiaoAiClient aiClient;

    /**
     * 解释某个字为什么这么拆。
     *
     * @param body 前端构造的上下文（char / code / positions / notes / error，可含 conversationId）
     * @return agent 输出字段原样 + conversationId / turn（启用会话时）
     */
    public Map<String, Object> explain(Map<String, Object> body) {
        Map<String, Object> safeBody = body != null ? body : Map.of();

        Object charValue = safeBody.get("char");
        Object codeValue = safeBody.get("code");
        Object positions = safeBody.get("positions");

        if (!(charValue instanceof String charText) || charText.isBlank()) {
            throw new BusinessException("VALIDATION_FAILED", "char 不能为空", 400);
        }
        if (!(codeValue instanceof String codeText) || codeText.isBlank()) {
            throw new BusinessException("VALIDATION_FAILED", "code 不能为空", 400);
        }
        if (!(positions instanceof List<?> positionList) || positionList.isEmpty()) {
            throw new BusinessException("VALIDATION_FAILED", "positions 不能为空", 400);
        }

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("tool", TOOL_NAME);
        metadata.put("action", "explain-split");
        // 带上字，便于在 ai_invocations / Langfuse 里按字复盘失败样本
        metadata.put("char", charValue);
        /*
         * 首轮没有会话就建一个，否则追问无从接起。
         * 建会话失败时返回 null：**不写这个 key**，语义上就是「本轮没有会话」，
         * 与「带了一个 null 的会话 id」相比不会让下游误以为会话存在。
         */
        String conversationId = ensureConversation(safeBody);
        if (conversationId != null) {
            metadata.put("conversation_id", conversationId);
        }

        try {
            MiaoAiInvokeResponse response = aiClient.invoke(AGENT_KEY, safeBody, metadata);
            return attachConversation(requireMapOutput(response), response);
        } catch (BusinessException e) {
            throw mapUpstream(e);
        } catch (Exception e) {
            log.error("五笔拆字解释失败：char={}", charValue, e);
            throw new BusinessException("AI_ANALYSIS_FAILED",
                    e.getMessage() != null ? e.getMessage() : "五笔拆字解释失败", 502);
        }
    }

    /**
     * 追问：对上一轮的结论继续问，历史由平台按 conversation_id 注入。
     *
     * <p>传给 agent 的 input **只含 char + question**：不重发 code / positions，
     * 让 agent 从历史里取上一轮的结论与候选集，追问才成立（否则就是重讲一遍）。
     *
     * @param body 需含 char / question / conversationId
     * @return agent 输出字段原样 + conversationId / turn（启用会话时）
     */
    public Map<String, Object> followup(Map<String, Object> body) {
        Map<String, Object> safeBody = body != null ? body : Map.of();

        Object charValue = safeBody.get("char");
        Object question = safeBody.get("question");
        Object conversationId = safeBody.get("conversationId");

        if (!(charValue instanceof String charText) || charText.isBlank()) {
            throw new BusinessException("VALIDATION_FAILED", "char 不能为空", 400);
        }
        if (!(question instanceof String questionText) || questionText.isBlank()) {
            throw new BusinessException("VALIDATION_FAILED", "question 不能为空", 400);
        }
        if (!(conversationId instanceof String conversationIdText) || conversationIdText.isBlank()) {
            throw new BusinessException("VALIDATION_FAILED", "conversationId 不能为空", 400);
        }

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("tool", TOOL_NAME);
        metadata.put("action", "followup");
        metadata.put("char", charValue);
        metadata.put("conversation_id", conversationId);

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("char", charValue);
        input.put("question", question);

        try {
            MiaoAiInvokeResponse response = aiClient.invoke(AGENT_KEY, input, metadata);
            return attachConversation(requireMapOutput(response), response);
        } catch (BusinessException e) {
            throw mapUpstream(e);
        } catch (Exception e) {
            log.error("五笔追问失败：char={}", charValue, e);
            throw new BusinessException("AI_ANALYSIS_FAILED",
                    e.getMessage() != null ? e.getMessage() : "五笔追问失败", 502);
        }
    }

    // ========== 私有方法 ==========

    /**
     * 取本次调用要用的会话 ID；首轮没有就建一个。
     *
     * <p>建会话失败**不阻断主流程** —— 降级为单轮，用户照样能看到解释，只是不能追问。
     */
    String ensureConversation(Map<String, Object> body) {
        Object existing = body.get("conversationId");
        if (existing instanceof String s && !s.isBlank()) {
            return s;
        }
        try {
            return aiClient.createConversation(AGENT_KEY,
                    Map.of("tool", TOOL_NAME, "action", "explain-split"));
        } catch (Exception e) {
            log.warn("建会话失败，本轮降级为单轮：{}", e.getMessage());
            return null;
        }
    }

    /** 工具标识（写入 metadata 供 ai_invocations / Langfuse 归类），供流式路径复用 */
    String toolName() {
        return TOOL_NAME;
    }

    /**
     * 校验 agent 输出必须是结构化对象，并浅拷贝成可变 Map。
     *
     * <p>agent 可能返回纯文本（模型没按契约走），这时属于上游契约违约，统一按
     * {@code AI_RESPONSE_INVALID} 502 抛出，由全局异常处理器转为统一错误壳。
     */
    private Map<String, Object> requireMapOutput(MiaoAiInvokeResponse response) {
        Object output = response.getOutput();
        if (!(output instanceof Map<?, ?> raw)) {
            log.warn("wubi-explainer 返回非预期结构: {}", output);
            throw new BusinessException("AI_RESPONSE_INVALID", "AI 返回结构异常", 502);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        raw.forEach((k, v) -> result.put(String.valueOf(k), v));
        return result;
    }

    /**
     * 把会话信息附到响应上，供前端保存并在下一轮带回。
     *
     * <p>只在平台确实回了 conversation_id 时才附 —— 没启用会话时前端拿不到 id，
     * 自然退化为单轮。agent 的输出字段原样保留，中间层不做任何字段过滤：
     * 其中 positions 是**待校验的断言**，由前端拿候选字根核对后才决定是否展示。
     */
    private Map<String, Object> attachConversation(Map<String, Object> output,
                                                   MiaoAiInvokeResponse response) {
        if (response.getConversationId() == null) {
            return output;
        }
        Map<String, Object> enriched = new LinkedHashMap<>(output);
        enriched.put("conversationId", response.getConversationId());
        enriched.put("turn", response.getTurn());
        if (Boolean.TRUE.equals(response.getHistoryTruncated())) {
            enriched.put("historyTruncated", true);
        }
        return enriched;
    }

    /**
     * 把上游错误码映射为面向用户的错误码与 HTTP 状态。
     *
     * <p>只映射已知的上游语义，其余（含本地校验、结构异常等）**原样抛出**，
     * 避免把不相干的错误伪装成会话问题。
     *
     * <p>包级可见：流式路径（{@link WubiAiStreamService}）必须与同步路径给出**同一套**
     * 错误码，否则前端无法复用「410 自动开新会话」那条链路。
     */
    BusinessException mapUpstream(BusinessException e) {
        String errorCode = e.getErrorCode();
        if (errorCode == null) {
            return e;
        }
        return switch (errorCode) {
            case "AI_UPSTREAM_410" ->
                    new BusinessException("AI_CONVERSATION_EXPIRED",
                            "AI 会话已失效，请重新开始讲解", 410);
            /*
             * 404 与 410 分开：410 是「会话过期」（平台 TTL 到了），404 是「会话/Agent 不存在」
             * （被平台清理、或 agent 版本变了）。两者对用户都是「重新开始」，但错误码不合并 ——
             * 合并会让排障时分不清是配额/生命周期问题还是部署问题。
             */
            case "AI_UPSTREAM_404" ->
                    new BusinessException("AI_CONVERSATION_NOT_FOUND",
                            "AI 会话不存在（可能已在平台侧清理），已重新开始", 404);
            case "AI_UPSTREAM_403" ->
                    new BusinessException("AI_CONVERSATION_FORBIDDEN",
                            "AI 会话无权访问", 403);
            case "AI_UPSTREAM_409" ->
                    new BusinessException("AI_CONVERSATION_BUSY",
                            "上一轮还在处理中，请稍候", 409);
            case "AI_UPSTREAM_429" ->
                    new BusinessException("AI_QUOTA_EXCEEDED",
                            "AI 额度已用完", 429);
            case "AI_UPSTREAM_5XX" ->
                    new BusinessException("AI_SERVICE_UNAVAILABLE",
                            "miao-ai 服务不可用，请稍后重试", 503);
            default -> e;
        };
    }
}
