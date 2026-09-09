package com.miao.toolbox.tool.scheduler.executor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.infrastructure.HttpRequestExecutor;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetHeader;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.service.SchedulerCryptoService;
import com.miao.toolbox.tool.scheduler.util.SensitiveMasker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * HTTP 任务目标执行器（FR-4）——封装 network 模块 {@link HttpRequestExecutor}
 * （SSRF 安全出站），负责解密敏感 header、变量替换、结果判定与摘要构建。
 *
 * <p>结果判定（PRD 固定规则）：HTTP 2xx → SUCCESS；非 2xx → FAILED；
 * 连接/读超时（NETWORK_CONNECTION_TIMEOUT）→ TIMEOUT；其他网络错误 → FAILED。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HttpTaskExecutor implements TaskExecutor {

    /** request_summary 中 body 预览长度（字符） */
    private static final int REQUEST_BODY_PREVIEW = 200;
    /** response_summary 中 body 预览长度（字符，对应 PRD 4KB 截断） */
    private static final int RESPONSE_BODY_PREVIEW = 4096;

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final DateTimeFormatter NOW_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final HttpRequestExecutor httpRequestExecutor;
    private final SchedulerCryptoService cryptoService;

    @Override
    public TargetType supports() {
        return TargetType.HTTP;
    }

    @Override
    public ExecutionResult execute(ScheduledTask task) {
        HttpTargetConfig config = (HttpTargetConfig) task.getTargetConfig();
        Map<String, String> variables = Map.of(
                "now", LocalDateTime.now().format(NOW_FORMATTER),
                "taskName", task.getName() == null ? "" : task.getName(),
                "taskId", task.getId() == null ? "" : String.valueOf(task.getId()));

        // 1. 构建请求摘要（先于网络：任何失败路径都尽量带上请求摘要）
        String requestSummary = buildRequestSummary(config, variables);
        try {
            // 2. 解密敏感值 + 变量替换 → OkHttp headers
            List<HttpRequestExecutor.Header> headers = new ArrayList<>();
            if (config.getHeaders() != null) {
                for (TargetHeader h : config.getHeaders()) {
                    if (h.getName() == null || h.getName().isBlank()) {
                        continue;
                    }
                    String value = h.isSensitive() ? cryptoService.decrypt(h.getValue()) : h.getValue();
                    value = VariableReplacer.replace(value, variables);
                    headers.add(new HttpRequestExecutor.Header(h.getName(), value == null ? "" : value));
                }
            }

            String body = VariableReplacer.replace(config.getBody(), variables);

            // 3. 发起请求（SSRF 安全，复用 network 模块）
            long timeoutMs = config.getTimeoutSeconds() != null
                    ? config.getTimeoutSeconds() * 1000L : 30_000L;
            HttpRequestExecutor.Spec spec = new HttpRequestExecutor.Spec(
                    config.getUrl(), config.getMethod(), headers, "raw", body,
                    (int) Math.min(timeoutMs, Integer.MAX_VALUE));
            HttpRequestExecutor.Execution execution = httpRequestExecutor.send(spec);

            // 4. 结果判定
            boolean success = execution.statusCode() >= 200 && execution.statusCode() < 300;
            ExecutionStatus status = success ? ExecutionStatus.SUCCESS : ExecutionStatus.FAILED;
            String responseSummary = buildResponseSummary(execution);
            String error = success ? null : "HTTP " + execution.statusCode()
                    + (execution.statusText() == null || execution.statusText().isBlank()
                    ? "" : " " + execution.statusText());
            log.info("[task:{}] http executed status={} httpCode={} elapsed={}ms",
                    task.getId(), status, execution.statusCode(), execution.elapsedMs());
            return ExecutionResult.of(status, requestSummary, responseSummary, error);
        } catch (BusinessException e) {
            // 超时单列 TIMEOUT，其余（DNS/SSL/连接/SSRF）→ FAILED
            ExecutionStatus status = ErrorCode.NETWORK_CONNECTION_TIMEOUT.equals(e.getErrorCode())
                    ? ExecutionStatus.TIMEOUT
                    : ExecutionStatus.FAILED;
            log.warn("[task:{}] http execution failed status={} error={}",
                    task.getId(), status, e.getMessage());
            return ExecutionResult.of(status, requestSummary, null,
                    e.getErrorCode() + ": " + e.getMessage());
        } catch (Exception e) {
            // 双保险：任何未预期异常都转为 FAILED，不向执行线程抛出
            log.error("[task:{}] http execution unexpected error", task.getId(), e);
            return ExecutionResult.of(ExecutionStatus.FAILED, requestSummary, null,
                    "执行异常: " + e.getMessage());
        }
    }

    /** 请求摘要 JSON：method/url/headers（敏感前4后4）/bodyPreview（200 字符）。 */
    private String buildRequestSummary(HttpTargetConfig config, Map<String, String> variables) {
        try {
            List<Map<String, String>> headers = new ArrayList<>();
            if (config.getHeaders() != null) {
                for (TargetHeader h : config.getHeaders()) {
                    if (h.getName() == null) {
                        continue;
                    }
                    String value = h.getValue() == null ? "" : h.getValue();
                    if (h.isSensitive()) {
                        // 存储的是密文：先解密得到明文再脱敏，保证摘要是可辨识的前4后4形态
                        try {
                            value = SensitiveMasker.maskPartial(cryptoService.decrypt(value));
                        } catch (Exception e) {
                            value = SensitiveMasker.maskFull(value);
                        }
                    }
                    headers.add(Map.of("name", h.getName(), "value", value));
                }
            }
            String rawBody = VariableReplacer.replace(config.getBody(), variables);
            String bodyPreview = preview(rawBody, REQUEST_BODY_PREVIEW);
            Map<String, Object> summary = new java.util.LinkedHashMap<>();
            summary.put("method", config.getMethod());
            summary.put("url", config.getUrl());
            summary.put("headers", headers);
            if (bodyPreview != null) {
                summary.put("bodyPreview", bodyPreview);
            }
            return MAPPER.writeValueAsString(summary);
        } catch (Exception e) {
            log.warn("[task:{}] request summary build failed: {}", config.getUrl(), e.getMessage());
            return null;
        }
    }

    /** 响应摘要 JSON：statusCode/statusText/bodyPreview（4KB 截断）/bodyBytes/truncated。 */
    private String buildResponseSummary(HttpRequestExecutor.Execution execution) {
        try {
            Map<String, Object> summary = new java.util.LinkedHashMap<>();
            summary.put("statusCode", execution.statusCode());
            summary.put("statusText", execution.statusText());
            summary.put("bodyPreview", preview(execution.body(), RESPONSE_BODY_PREVIEW));
            summary.put("bodyBytes", execution.bodyBytes());
            summary.put("truncated", execution.truncated());
            return MAPPER.writeValueAsString(summary);
        } catch (Exception e) {
            log.warn("response summary build failed: {}", e.getMessage());
            return null;
        }
    }

    private String preview(String text, int maxChars) {
        if (text == null) {
            return null;
        }
        return text.length() <= maxChars ? text : text.substring(0, maxChars);
    }
}
