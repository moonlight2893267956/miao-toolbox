package com.miao.toolbox.tool.scheduler.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyTrigger;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 执行通知（FR-10/FR-11，Epic 2）。
 *
 * <p>执行记录落库后由 {@link ExecutionEngine} 调用；运行在通知线程池
 * （{@code schedulerNotifyExecutor}，core=2），不阻塞执行结果返回。
 *
 * <p>双通道独立：Webhook 与邮件各自判定 trigger、各自 try-catch，
 * 一个通道失败/跳过不影响另一个。
 *
 * <p>失败语义（FR-10）：任何异常仅 {@code log.warn}（[task:{}] 前缀），
 * 不影响执行结果、不重试；SSRF 拦截 / URL 非法 / SMTP 未配置时跳过发送。
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

    /** SMTP 邮件发送器（可选：未配置 SMTP 时不注入，邮件通道静默跳过） */
    @Autowired(required = false)
    private JavaMailSender mailSender;

    /** 发件人地址（与 auth 模块 EmailSendService 共用配置） */
    @Value("${app.mail.from:noreply@example.com}")
    private String mailFrom;

    /** 前端站点根地址（用于拼接执行详情链接）；空 = payload/邮件不带链接 */
    @Value("${scheduler.notify.frontend-base-url:}")
    private String frontendBaseUrl;

    /**
     * 执行完成通知入口（FR-10/FR-11）。SKIPPED 未真正执行，不通知；
     * 未配置 notify_config 时静默返回。Webhook 与邮件双通道独立处理。
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
            // Webhook 通道（独立判定，失败不影响邮件通道）
            try {
                maybeSendWebhook(task, execution, notify.getWebhook());
            } catch (Exception e) {
                log.warn("[task:{}] webhook notification failed: {}", task.getId(), e.getMessage());
            }
            // 邮件通道（独立判定，失败不影响 webhook 通道）
            try {
                maybeSendEmail(task, execution, notify.getEmail());
            } catch (Exception e) {
                log.warn("[task:{}] email notification failed: {}", task.getId(), e.getMessage());
            }
        } catch (Exception e) {
            // 通知失败仅记日志：不影响执行结果，不重试（FR-10）
            log.warn("[task:{}] notification dispatch failed: {}",
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

    // ------------------------------------------------------------
    // Webhook 通道
    // ------------------------------------------------------------

    private void maybeSendWebhook(ScheduledTask task, TaskExecution execution,
                                  NotifyConfig.WebhookNotify webhook) {
        if (webhook == null || webhook.getUrl() == null || webhook.getUrl().isBlank()) {
            return;
        }
        NotifyTrigger trigger = webhook.getTrigger() == null ? NotifyTrigger.ON_FAILURE : webhook.getTrigger();
        if (!triggerMatches(trigger, execution.getStatus())) {
            return;
        }
        sendWebhook(task, execution, webhook.getUrl().trim());
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

    // ------------------------------------------------------------
    // 邮件通道
    // ------------------------------------------------------------

    private void maybeSendEmail(ScheduledTask task, TaskExecution execution,
                                NotifyConfig.EmailNotify email) {
        if (email == null || email.getRecipients() == null || email.getRecipients().isEmpty()) {
            return;
        }
        NotifyTrigger trigger = email.getTrigger() == null ? NotifyTrigger.ON_FAILURE : email.getTrigger();
        if (!triggerMatches(trigger, execution.getStatus())) {
            return;
        }
        sendEmail(task, execution, email.getRecipients());
    }

    private void sendEmail(ScheduledTask task, TaskExecution execution, List<String> recipients) {
        if (mailSender == null) {
            log.warn("[task:{}] email skipped, JavaMailSender not configured (SMTP missing)", task.getId());
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(recipients.toArray(new String[0]));
            helper.setSubject(buildEmailSubject(task, execution));
            helper.setText(buildEmailHtml(task, execution), true);
            mailSender.send(message);
            log.info("[task:{}] email notified, recipients={}", task.getId(), recipients.size());
        } catch (Exception e) {
            log.warn("[task:{}] email notification failed: {}", task.getId(), e.getMessage());
        }
    }

    private String buildEmailSubject(ScheduledTask task, TaskExecution execution) {
        String status = execution.getStatus() == null ? "UNKNOWN" : execution.getStatus().name();
        return "【阿渺工具箱】定时任务「%s」执行 %s".formatted(task.getName(), status);
    }

    /** 邮件正文 HTML：任务/执行摘要 + 详情链接。 */
    private String buildEmailHtml(ScheduledTask task, TaskExecution execution) {
        String status = execution.getStatus() == null ? "-" : execution.getStatus().name();
        String statusColor = execution.getStatus() == ExecutionStatus.SUCCESS ? "#52c41a" : "#ff4d4f";
        String triggeredAt = toUtcIso(execution.getTriggeredAt());
        String duration = execution.getDurationMs() == null ? "-" : execution.getDurationMs() + " ms";
        String retry = String.valueOf(execution.getRetryCount() == null ? 0 : execution.getRetryCount());
        String error = execution.getErrorMessage() == null || execution.getErrorMessage().isBlank()
                ? "（无）" : execution.getErrorMessage();
        String detailUrl = buildDetailUrl(task.getId());
        String detailLink = detailUrl == null
                ? "（未配置站点地址）"
                : "<a href=\"%s\" style=\"color:#1890ff;\">查看执行详情</a>".formatted(detailUrl);

        return """
                <div style="max-width:600px;margin:0 auto;font-family:sans-serif;padding:24px;">
                  <h2 style="color:#333;border-bottom:2px solid #1890ff;padding-bottom:8px;">阿渺工具箱 · 执行通知</h2>
                  <table style="width:100%%;border-collapse:collapse;font-size:14px;">
                    <tr><td style="padding:6px 0;color:#999;width:100px;">任务名称</td><td style="padding:6px 0;">%s (#%d)</td></tr>
                    <tr><td style="padding:6px 0;color:#999;">执行状态</td><td style="padding:6px 0;font-weight:bold;color:%s;">%s</td></tr>
                    <tr><td style="padding:6px 0;color:#999;">触发时间</td><td style="padding:6px 0;">%s</td></tr>
                    <tr><td style="padding:6px 0;color:#999;">耗时</td><td style="padding:6px 0;">%s</td></tr>
                    <tr><td style="padding:6px 0;color:#999;">重试次数</td><td style="padding:6px 0;">%s</td></tr>
                    <tr><td style="padding:6px 0;color:#999;vertical-align:top;">错误信息</td><td style="padding:6px 0;color:#ff4d4f;">%s</td></tr>
                  </table>
                  <p style="margin-top:16px;">%s</p>
                  <p style="color:#999;font-size:12px;margin-top:24px;">此邮件由阿渺工具箱定时任务模块自动发送，请勿回复。</p>
                </div>
                """.formatted(
                task.getName(), task.getId(),
                statusColor, status,
                triggeredAt == null ? "-" : triggeredAt,
                duration,
                retry,
                error,
                detailLink
        );
    }

    // ------------------------------------------------------------
    // 共享工具
    // ------------------------------------------------------------

    private String buildDetailUrl(Long taskId) {
        String base = frontendBaseUrl == null ? "" : frontendBaseUrl.trim();
        if (base.isEmpty()) {
            return null;
        }
        return base.replaceAll("/+$", "") + "/tools/task-scheduler/" + taskId;
    }

    /** LocalDateTime（服务器本地时区）→ UTC ISO-8601（带 Z）：webhook/邮件消费方无时区歧义 */
    private String toUtcIso(LocalDateTime localDateTime) {
        if (localDateTime == null) {
            return null;
        }
        return localDateTime.atZone(ZoneId.systemDefault()).toInstant().toString();
    }
}
