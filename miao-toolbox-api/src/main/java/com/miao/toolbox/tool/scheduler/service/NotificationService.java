package com.miao.toolbox.tool.scheduler.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyTrigger;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 执行通知（FR-10，Epic 2）。
 *
 * <p>执行记录落库后由 {@link ExecutionEngine} 调用；运行在通知线程池
 * （{@code schedulerNotifyExecutor}，core=2），不阻塞执行结果返回。
 *
 * <p>失败语义（FR-10）：任何异常仅 {@code log.warn}（[task:{}] 前缀），
 * 不影响执行结果、不重试；SSRF 拦截 / URL 非法时跳过发送。
 *
 * <p>触发条件（FR-10）：ALWAYS 每次 / ON_FAILURE 仅非成功（FAILED/TIMEOUT，默认）/
 * ON_SUCCESS 仅成功；SKIPPED（skip 重叠未真正执行）不通知。
 */
@Slf4j
@Service("schedulerNotificationService")
@RequiredArgsConstructor
public class NotificationService {

    private static final long WEBHOOK_TIMEOUT_MS = 10_000L;

    private final HttpFetcher httpFetcher;
    private final SsrfProtector ssrfProtector;
    private final ObjectMapper objectMapper;

    /** 前端站点根地址（用于拼接执行详情链接）；空 = payload 不带 detailUrl */
    @Value("${scheduler.notify.frontend-base-url:}")
    private String frontendBaseUrl;

    /**
     * 执行完成通知入口（FR-10）。SKIPPED 未真正执行，不通知；
     * 未配置 notify_config / webhook 时静默返回。
     */
    @Async("schedulerNotifyExecutor")
    public void onExecutionFinished(ScheduledTask task, TaskExecution execution) {
        try {
            if (task == null || execution == null) {
                return;
            }
            if (execution.getStatus() == ExecutionStatus.SKIPPED) {
                return;
            }
            NotifyConfig notify = task.getNotifyConfig();
            if (notify == null) {
                return;
            }
            NotifyConfig.WebhookNotify webhook = notify.getWebhook();
            if (webhook == null || webhook.getUrl() == null || webhook.getUrl().isBlank()) {
                return;
            }
            NotifyTrigger trigger = webhook.getTrigger() == null ? NotifyTrigger.ON_FAILURE : webhook.getTrigger();
            if (!triggerMatches(trigger, execution.getStatus())) {
                return;
            }
            sendWebhook(task, execution, webhook.getUrl().trim());
        } catch (Exception e) {
            // 通知失败仅记日志：不影响执行结果，不重试（FR-10）
            log.warn("[task:{}] webhook notification failed: {}",
                    task == null ? "-" : task.getId(), e.getMessage());
        }
    }

    /** 触发条件判定：ON_FAILURE 把 FAILED/TIMEOUT 都视为失败侧。 */
    private boolean triggerMatches(NotifyTrigger trigger, ExecutionStatus status) {
        return switch (trigger) {
            case ALWAYS -> true;
            case ON_SUCCESS -> status == ExecutionStatus.SUCCESS;
            case ON_FAILURE -> status != ExecutionStatus.SUCCESS;
        };
    }

    private void sendWebhook(ScheduledTask task, TaskExecution execution, String url) {
        try {
            URI uri = URI.create(url);
            // 协议白名单（FR-13）：保存时已校验，此处兜底——防其它写入路径（导入/刷库）带入非 http(s) URL
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                log.warn("[task:{}] webhook skipped, unsupported scheme: {}", task.getId(), scheme);
                return;
            }
            String host = uri.getHost();
            if (host == null || host.isBlank()) {
                log.warn("[task:{}] webhook skipped, url has no host", task.getId());
                return;
            }
            // 双保险：HttpFetcher 内部亦做 SSRF 校验；此处提前拦截并静默跳过
            ssrfProtector.resolveAndValidate(host);
        } catch (Exception e) {
            log.warn("[task:{}] webhook skipped, url rejected: {}", task.getId(), e.getMessage());
            return;
        }

        try {
            String body = objectMapper.writeValueAsString(buildPayload(task, execution));
            HttpFetcher.HttpFetchResult result =
                    httpFetcher.fetchWithBody(url, "POST", Map.of(), body, WEBHOOK_TIMEOUT_MS);
            if (result.statusCode() < 200 || result.statusCode() >= 300) {
                log.warn("[task:{}] webhook notification failed: HTTP {}",
                        task.getId(), result.statusCode());
                return;
            }
            log.info("[task:{}] webhook notified, httpCode={} elapsed={}ms",
                    task.getId(), result.statusCode(), result.elapsedMs());
        } catch (Exception e) {
            log.warn("[task:{}] webhook notification failed: {}", task.getId(), e.getMessage());
        }
    }

    /** 回调 payload（架构 FR-10）：任务/执行信息 + 详情链接。 */
    private Map<String, Object> buildPayload(ScheduledTask task, TaskExecution execution) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", task.getId());
        payload.put("taskName", task.getName());
        payload.put("executionId", execution.getId());
        payload.put("status", execution.getStatus() == null ? null : execution.getStatus().name());
        payload.put("triggerType", execution.getTriggerType() == null ? null : execution.getTriggerType().name());
        payload.put("triggeredAt", toUtcIso(execution.getTriggeredAt()));
        payload.put("durationMs", execution.getDurationMs());
        payload.put("retryCount", execution.getRetryCount());
        payload.put("error", execution.getErrorMessage());
        payload.put("detailUrl", buildDetailUrl(task.getId()));
        return payload;
    }

    private String buildDetailUrl(Long taskId) {
        String base = frontendBaseUrl == null ? "" : frontendBaseUrl.trim();
        if (base.isEmpty()) {
            return null;
        }
        return base.replaceAll("/+$", "") + "/tools/task-scheduler/" + taskId;
    }

    /** LocalDateTime（服务器本地时区）→ UTC ISO-8601（带 Z）：webhook 消费方无时区歧义 */
    private String toUtcIso(LocalDateTime localDateTime) {
        if (localDateTime == null) {
            return null;
        }
        return localDateTime.atZone(ZoneId.systemDefault()).toInstant().toString();
    }
}
