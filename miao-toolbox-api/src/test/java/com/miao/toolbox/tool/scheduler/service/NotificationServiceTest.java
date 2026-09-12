package com.miao.toolbox.tool.scheduler.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyTrigger;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 执行通知（Story 4.1/4.2/4.3）。
 *
 * <p>重点覆盖两类易被回归破坏的契约：
 * <ol>
 *   <li>邮件正文：用户可控字段必须 HTML 转义，且必须带退出码与 stderr 预览（FR-11 明列字段）；</li>
 *   <li>Webhook：触发条件不匹配 / 协议非 http(s) 时不得发出请求（FR-11 + 4.3 兜底校验）。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Scheduler 执行通知")
class NotificationServiceTest {

    @Mock
    private HttpFetcher httpFetcher;

    @Mock
    private SsrfProtector ssrfProtector;

    /** 用真实 ObjectMapper：response_summary 的 exitCode / stderr 需真实解析 */
    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private NotificationService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "mailFrom", "noreply@test.com");
        ReflectionTestUtils.setField(service, "frontendBaseUrl", "");
    }

    private ScheduledTask task(String name) {
        return ScheduledTask.builder()
                .id(7L)
                .name(name)
                .scriptId(1L)
                .scriptVersion(1)
                .cronExpression("0 0 3 * * *")
                .timezone("Asia/Shanghai")
                .timeoutSeconds(60)
                .build();
    }

    private TaskExecution execution(ExecutionStatus status, String responseSummary, String errorMessage) {
        return TaskExecution.builder()
                .id(100L)
                .taskId(7L)
                .triggerType(TriggerType.SCHEDULED)
                .triggeredAt(LocalDateTime.of(2026, 9, 13, 10, 0))
                .startedAt(LocalDateTime.of(2026, 9, 13, 10, 0))
                .finishedAt(LocalDateTime.of(2026, 9, 13, 10, 0, 1))
                .durationMs(1000)
                .status(status)
                .retryCount(0)
                .requestSummary("{\"params\":{}}")
                .responseSummary(responseSummary)
                .errorMessage(errorMessage)
                .build();
    }

    private ScheduledTask webhookTask(String url, NotifyTrigger trigger) {
        ScheduledTask task = task("清理日志");
        task.setNotifyConfig(NotifyConfig.builder()
                .webhook(NotifyConfig.WebhookNotify.builder().url(url).trigger(trigger).build())
                .build());
        return task;
    }

    // ------------------------------------------------------------
    // 邮件正文（FR-11）
    // ------------------------------------------------------------

    @DisplayName("邮件正文：转义用户可控字段，并含退出码与 stderr 预览")
    @Test
    void emailHtmlEscapesAndIncludesExitCodeAndStderr() {
        String html = service.buildEmailHtml(
                task("<script>alert(1)</script>"),
                execution(ExecutionStatus.FAILED,
                        "{\"exitCode\":3,\"stdout\":\"\",\"stderr\":\"disk full on /tmp\"}",
                        "退出码 3：disk full"));

        // 用户可控字段必须转义，防邮件正文注入
        assertThat(html).doesNotContain("<script>");
        assertThat(html).contains("&lt;script&gt;");
        // FR-11 明列字段：退出码 + stderr
        assertThat(html).contains("退出码").contains(">3<");
        assertThat(html).contains("disk full on /tmp");
    }

    @DisplayName("邮件正文：stderr 超长时截断并标注")
    @Test
    void emailStderrPreviewTruncated() {
        String stderr = "x".repeat(600);
        String html = service.buildEmailHtml(
                task("清理日志"),
                execution(ExecutionStatus.FAILED,
                        "{\"exitCode\":1,\"stdout\":\"\",\"stderr\":\"" + stderr + "\"}",
                        "failed"));

        assertThat(html).contains("已截断，完整输出见执行详情");
        // 只保留前 500 字符：完整 600 字符不应出现
        assertThat(html).contains("x".repeat(500)).doesNotContain("x".repeat(501));
    }

    @DisplayName("未配置站点地址时邮件显示占位文案而非链接")
    @Test
    void emailShowsPlaceholderWhenBaseUrlMissing() {
        String html = service.buildEmailHtml(
                task("清理日志"),
                execution(ExecutionStatus.FAILED, "{\"exitCode\":1}", "failed"));

        assertThat(html).contains("（未配置站点地址）").doesNotContain("查看执行详情");
    }

    @DisplayName("配置了站点地址时邮件带详情链接")
    @Test
    void emailIncludesDetailLinkWhenBaseUrlSet() {
        ReflectionTestUtils.setField(service, "frontendBaseUrl", "https://miao.example.com/");

        String html = service.buildEmailHtml(
                task("清理日志"),
                execution(ExecutionStatus.FAILED, "{\"exitCode\":1}", "failed"));

        assertThat(html).contains("https://miao.example.com/tools/task-scheduler/7");
    }

    // ------------------------------------------------------------
    // Webhook（FR-11 / Story 4.3 兜底）
    // ------------------------------------------------------------

    @DisplayName("触发条件不匹配（ON_FAILURE + SUCCESS）→ 不发送")
    @Test
    void webhookSkippedWhenTriggerNotMatched() {
        service.onExecutionFinished(
                webhookTask("https://hook.example.com/x", NotifyTrigger.ON_FAILURE),
                execution(ExecutionStatus.SUCCESS, "{\"exitCode\":0}", null));

        verify(httpFetcher, never()).fetchWithBody(anyString(), anyString(), anyMap(), anyString(), anyLong());
    }

    @DisplayName("协议非 http/https → 兜底拦截，不发送（防旁路写入路径）")
    @Test
    void webhookRejectedForNonHttpScheme() {
        service.onExecutionFinished(
                webhookTask("ftp://hook.example.com/x", NotifyTrigger.ALWAYS),
                execution(ExecutionStatus.FAILED, "{\"exitCode\":1}", "failed"));

        verify(httpFetcher, never()).fetchWithBody(anyString(), anyString(), anyMap(), anyString(), anyLong());
    }

    @DisplayName("SKIPPED（重叠跳过、未真正执行）不通知")
    @Test
    void skippedExecutionDoesNotNotify() {
        service.onExecutionFinished(
                webhookTask("https://hook.example.com/x", NotifyTrigger.ALWAYS),
                execution(ExecutionStatus.SKIPPED, null, null));

        verify(httpFetcher, never()).fetchWithBody(anyString(), anyString(), anyMap(), anyString(), anyLong());
    }

    @DisplayName("SMTP 未配置（mailSender 为 null）→ 邮件通道静默跳过，不抛异常")
    @Test
    void emailSkippedWhenMailSenderMissing() {
        ScheduledTask task = task("清理日志");
        task.setNotifyConfig(NotifyConfig.builder()
                .email(NotifyConfig.EmailNotify.builder()
                        .recipients(java.util.List.of("ops@example.com"))
                        .trigger(NotifyTrigger.ALWAYS)
                        .build())
                .build());

        assertDoesNotThrow(() -> service.onExecutionFinished(task,
                execution(ExecutionStatus.FAILED, "{\"exitCode\":1}", "failed")));
    }

    @DisplayName("发送异常被消化，不向上传播（通知失败不影响执行结果）")
    @Test
    void webhookExceptionSwallowed() {
        // ssrfProtector 为 @Mock，resolveAndValidate 默认不抛，无需打桩
        org.mockito.Mockito.doThrow(new RuntimeException("network down"))
                .when(httpFetcher)
                .fetchWithBody(anyString(), anyString(), anyMap(), anyString(), anyLong());

        assertDoesNotThrow(() -> service.onExecutionFinished(
                webhookTask("https://hook.example.com/x", NotifyTrigger.ALWAYS),
                execution(ExecutionStatus.FAILED, "{\"exitCode\":1}", "failed")));
    }
}
