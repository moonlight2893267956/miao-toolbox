package com.miao.toolbox.tool.wubi;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.common.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 五笔拆字 AI 解释入口。
 *
 * <p>端点：{@code POST /api/wubi/ai/explain}、{@code POST /api/wubi/ai/followup}（同步）。
 * 受 {@code TOOL_WUBI_TUTOR} 路由权限保护（该路由已由 {@code V36__register_wubi_tutor_route.sql} 注册）。
 * 业务逻辑在 {@link WubiAiService}，这里只做转发 —— 不写 try/catch，
 * 让 {@code BusinessException} 冒泡给全局 {@code GlobalExceptionHandler}，
 * 统一产出 {@code {code, message, requestId}} 错误壳。
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
 *
 * <h3>错误码语义</h3>
 * 上游错误由 {@link WubiAiService} 翻译成面向用户的语义码：会话失效 410
 * （{@code AI_CONVERSATION_EXPIRED}）、并发占用 409（{@code AI_CONVERSATION_BUSY}）、
 * 配额耗尽 429（{@code AI_QUOTA_EXCEEDED}）；请求体不合法为 400
 * （{@code VALIDATION_FAILED}）。前端按 HTTP 状态与 {@code code} 分支做提示与降级。
 */
@Slf4j
@RestController
@RequestMapping("/api/wubi/ai")
@RequireRoute("TOOL_WUBI_TUTOR")
@RequiredArgsConstructor
public class WubiAiController {

    private final WubiAiService wubiAiService;

    /**
     * POST /api/wubi/ai/explain —— 解释某个字为什么这么拆。
     */
    @PostMapping("/explain")
    public ResponseEntity<ApiResponse<Map<String, Object>>> explain(
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.success(wubiAiService.explain(body)));
    }

    /**
     * POST /api/wubi/ai/followup —— 对上一轮的解释追问（需带 conversationId）。
     */
    @PostMapping("/followup")
    public ResponseEntity<ApiResponse<Map<String, Object>>> followup(
            @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.success(wubiAiService.followup(body)));
    }
}
