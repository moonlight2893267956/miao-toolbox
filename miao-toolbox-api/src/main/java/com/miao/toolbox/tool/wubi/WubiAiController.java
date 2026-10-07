package com.miao.toolbox.tool.wubi;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.observability.MiaoAiClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 五笔拆字 AI 解释。
 *
 * <p>端点：{@code POST /api/wubi/ai/explain}（同步）。受 {@code TOOL_WUBI_TUTOR} 路由权限保护
 * （该路由已由 {@code V36__register_wubi_tutor_route.sql} 注册）。
 *
 * <h3>为什么走同步而不是 SSE</h3>
 * 与正则 / Cron 那两个 SSE agent 不同，wubi-explainer **不流式返回**：它要给出
 * 结构化断言（每一位的 key 与字根）供前端逐条校验，流式只会让用户先看到半截 JSON。
 * 没有增量价值就没有流式的理由 —— 与 {@code JsonWorkbenchController} 的 ai-repair 同构。
 *
 * <h3>为什么中间层不改写 body</h3>
 * 前端构造的上下文（字 / 编码 / 逐位键位与候选字根 / 标注 / 用户错误）与 agent 的
 * {@code input} 契约**逐字段一致**，这里原样转发。少一处字段转换，就少一处以后对不上的机会。
 *
 * <h3>校验分工</h3>
 * 这里只做「形」的校验（字段在不在、类型对不对），**取值域校验留给 agent**：
 * 候选字根集在 agent 手上，在中间层重复实现一份只会变成两处需要同步的真相。
 */
@Slf4j
@RestController
@RequestMapping("/api/wubi/ai")
@RequireRoute("TOOL_WUBI_TUTOR")
@RequiredArgsConstructor
public class WubiAiController {

    /** wubi-explainer agent key，对应 Nacos 中 miao.ai.agents 下的 key */
    private static final String AGENT_KEY = "wubi-explainer";

    private final MiaoAiClient aiClient;

    @PostMapping("/explain")
    public ResponseEntity<Object> explain(@RequestBody Map<String, Object> body) {
        Object charValue = body.get("char");
        Object codeValue = body.get("code");
        Object positions = body.get("positions");

        if (!(charValue instanceof String) || ((String) charValue).isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "char 不能为空"));
        }
        if (!(codeValue instanceof String) || ((String) codeValue).isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "code 不能为空"));
        }
        if (!(positions instanceof List<?> list) || list.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "positions 不能为空"));
        }

        try {
            Map<String, Object> metadata = Map.of(
                    "tool", "wubi-tutor",
                    "action", "explain-split",
                    // 带上字，便于在 ai_invocations / Langfuse 里按字复盘失败样本
                    "char", charValue
            );

            var response = aiClient.invoke(AGENT_KEY, body, metadata);
            var output = response.getOutput();

            if (!(output instanceof Map)) {
                log.warn("wubi-explainer 返回非预期结构: {}", output);
                return ResponseEntity.internalServerError()
                        .body(Map.of("error", "AI 返回结构异常"));
            }

            /*
             * 原样回传 agent 的输出。
             *
             * 其中 positions 是**待校验的断言**，由前端拿候选字根核对后才决定是否展示 ——
             * 中间层不做「看起来像就放行」的过滤，否则校验就成了摆设。
             */
            return ResponseEntity.ok(output);
        } catch (Exception e) {
            log.error("五笔拆字解释失败", e);
            String msg = e.getMessage() != null ? e.getMessage() : "AI 解释服务异常";
            if (msg.contains("配额") || msg.contains("quota") || msg.contains("额度")) {
                return ResponseEntity.status(429).body(Map.of("error", "AI 额度已用完"));
            }
            return ResponseEntity.internalServerError().body(Map.of("error", msg));
        }
    }
}
