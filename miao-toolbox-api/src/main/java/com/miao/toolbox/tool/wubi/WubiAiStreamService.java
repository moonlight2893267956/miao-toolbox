package com.miao.toolbox.tool.wubi;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 讲解台的**流式**业务服务：只负责「把请求组装成 miao-ai 能吃的形状」，
 * 真正的 SSE 读写与转发在 {@link WubiAiStreamController}（它需要 SseEmitter，属 HTTP 层）。
 *
 * <h3>为什么单独一个 Service，而不是塞进 WubiAiService</h3>
 *
 * 同步路径与流式路径**共享**的语义（形校验、会话懒创建、上游错误码映射）留在
 * {@link WubiAiService}，这里只做流式特有的三件事：
 * <ol>
 *   <li>把 input 组装成 agent 契约的形状（同步路径是把前端 body 原样转发，
 *       流式路径同理，但要显式去掉不属于 agent input 的键）；</li>
 *   <li>把 metadata（tool / action / char / conversation_id）组装好 ——
 *       会话 id 必须在**流开始前**就确定，因为平台靠它注入历史；</li>
 *   <li>把 miao-ai 的流地址、鉴权头、请求体交给 Controller。</li>
 * </ol>
 *
 * <h3>降级纪律（与同步路径一致）</h3>
 *
 * 建会话失败**不阻断**：本轮退化为单轮，事件照常流，只是没有追问能力。
 * AI 是可选增强，这条在任何路径上都不能破。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WubiAiStreamService {

    /** wubi-explainer agent key，与同步路径共用同一份配置 */
    static final String AGENT_KEY = "wubi-explainer";

    /**
     * 允许透传给 agent 的 input 键，**与 `agent.yaml` 的 input 契约一一对应**。
     *
     * <p>用显式清单而不是「原样转发 body」：body 里有 `conversationId`（走 metadata），
     * 原样转发会让 agent 拿到契约外字段。清单必须与契约保持同步 ——
     * 增删 agent 入参时**这里和 agent.yaml 要一起改**（少了 `task` 就是词组全废）。
     */
    private static final List<String> AGENT_INPUT_KEYS = List.of(
            "char", "task", "phrase", "ruleLabel", "derivedCode", "matchesTable",
            "skippedChars", "code", "positions", "notes", "error", "online");

    private final MiaoAiClient aiClient;
    private final MiaoAiProperties miaoAiProperties;
    private final WubiAiService wubiAiService;

    /**
     * 一次流式讲解所需的全部材料。
     *
     * @param streamUrl miao-ai 的 `/invoke/stream` 地址
     * @param headers   鉴权头（Bearer 密钥只在后端）
     * @param body      请求体（input + metadata）
     */
    public record StreamRequest(String streamUrl, HttpHeaders headers, Map<String, Object> body) {
    }

    /**
     * 组装「首轮讲解」的流式请求。
     *
     * @param body 前端 body（char / code / positions / notes / error / conversationId?）
     */
    public StreamRequest prepareExplain(Map<String, Object> body) {
        Map<String, Object> safeBody = body != null ? body : Map.of();
        requireExplainShape(safeBody);

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("tool", wubiAiService.toolName());
        metadata.put("action", "explain-split");
        metadata.put("char", safeBody.get("char"));
        // 首轮没有会话就建一个（失败降级为单轮）；必须赶在流开始前，平台靠它注入历史
        String conversationId = wubiAiService.ensureConversation(safeBody);
        if (conversationId != null) {
            metadata.put("conversation_id", conversationId);
        }

        return new StreamRequest(
                aiClient.getStreamUrl(AGENT_KEY),
                aiClient.getStreamHeaders(AGENT_KEY),
                aiClient.buildStreamBody(agentInput(safeBody), metadata));
    }

    /**
     * 组装「追问」的流式请求。
     *
     * <p>与同步路径一致：传给 agent 的 input **只含 char + question**，
     * 不重发 code / positions —— 否则就是让 agent 重讲一遍，而不是回答追问。
     */
    public StreamRequest prepareFollowup(Map<String, Object> body) {
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
        if (!(conversationId instanceof String conversationIdText)
                || conversationIdText.isBlank()) {
            throw new BusinessException("VALIDATION_FAILED", "conversationId 不能为空", 400);
        }

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("tool", wubiAiService.toolName());
        metadata.put("action", "followup");
        metadata.put("char", charValue);
        metadata.put("conversation_id", conversationId);

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("char", charValue);
        input.put("question", question);

        return new StreamRequest(
                aiClient.getStreamUrl(AGENT_KEY),
                aiClient.getStreamHeaders(AGENT_KEY),
                aiClient.buildStreamBody(input, metadata));
    }

    /** 「形」的校验：取值域留给 agent，这里只确认字段在不在、类型对不对（与同步路径同口径） */
    private void requireExplainShape(Map<String, Object> body) {
        Object charValue = body.get("char");
        Object codeValue = body.get("code");
        Object positions = body.get("positions");

        if (!(charValue instanceof String charText) || charText.isBlank()) {
            throw new BusinessException("VALIDATION_FAILED", "char 不能为空", 400);
        }
        if (!(codeValue instanceof String codeText) || codeText.isBlank()) {
            throw new BusinessException("VALIDATION_FAILED", "code 不能为空", 400);
        }
        if (!(positions instanceof List<?> positionList) || positionList.isEmpty()) {
            throw new BusinessException("VALIDATION_FAILED", "positions 不能为空", 400);
        }
    }

    /**
     * 从调用方 body 里挑出属于 agent `input` 的键。
     *
     * <p>`conversationId` 是**中间层与会话层的约定**（走 metadata），不属于 agent input ——
     * 原样转发会让 agent 的 `_parse_input` 拿到一个它不认识的字段。其余字段都是
     * `agent.yaml` 契约里有的，原样透传。
     *
     * <p>!! `task` 与词组相关字段一个都不能漏 !!
     * agent 靠 `task == "explain-phrase"`（或逐位材料带 `fromChar`）判断**词组模式**；
     * 漏了它，词组会被当成单字走 `_parse_input`，直接以「char 必须是单个汉字」失败 ——
     * 现象是「单字讲解正常、词组讲解永远失败」。词组的规则名、推导码、不取码字同理。
     */
    private Map<String, Object> agentInput(Map<String, Object> body) {
        Map<String, Object> input = new LinkedHashMap<>();
        for (String key : AGENT_INPUT_KEYS) {
            if (body.containsKey(key)) {
                input.put(key, body.get(key));
            }
        }
        return input;
    }

    /** agent 是否可用（未配置 / 未启用时流式端点应立刻回错误事件，而不是去连一个空地址） */
    public boolean isAgentEnabled() {
        return miaoAiProperties.getAgent(AGENT_KEY).isEnabled();
    }
}
