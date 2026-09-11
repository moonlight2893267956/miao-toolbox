package com.miao.toolbox.tool.scheduler.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyTrigger;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * NotificationService 单元测试（FR-10/FR-11）：
 * Webhook 触发矩阵 / SSRF 拦截 / 失败仅记日志 / payload 结构 / 邮件通道 / 双通道独立。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("NotificationService 执行通知")
class NotificationServiceTest {

    private static final String WEBHOOK_URL = "https://hook.example.com/xyz";
    private static final List<String> EMAIL_RECIPIENTS = List.of("ops@example.com", "dev@example.com");

    @Mock
    private HttpFetcher httpFetcher;

    @Mock
    private SsrfProtector ssrfProtector;

    @Mock
    private JavaMailSender mailSender;

    private NotificationService service;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = new NotificationService(httpFetcher, ssrfProtector, objectMapper);
        ReflectionTestUtils.setField(service, "frontendBaseUrl", "https://tool.example.com");
        ReflectionTestUtils.setField(service, "mailFrom", "noreply@example.com");
        ReflectionTestUtils.setField(service, "mailSender", mailSender);
        // mailSender.createMimeMessage() 返回真实 MimeMessage，使 MimeMessageHelper 可写入内容供断言
        when(mailSender.createMimeMessage()).thenAnswer(inv -> new MimeMessage(Session.getInstance(new Properties())));
    }

    private ScheduledTask task(NotifyConfig notify) {
        return ScheduledTask.builder()
                .id(7L)
                .name("健康检查")
                .targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://example.com").build())
                .cronExpression("0 */5 * * * *")
                .timezone("Asia/Shanghai")
                .notifyConfig(notify)
                .build();
    }

    private TaskExecution execution(ExecutionStatus status) {
        return TaskExecution.builder()
                .id(900L)
                .taskId(7L)
                .triggerType(TriggerType.SCHEDULED)
                .triggeredAt(LocalDateTime.of(2026, 9, 11, 9, 0))
                .durationMs(1200)
                .status(status)
                .retryCount(1)
                .errorMessage(status == ExecutionStatus.SUCCESS ? null : "HTTP 503")
                .build();
    }

    private NotifyConfig webhook(NotifyTrigger trigger) {
        return NotifyConfig.builder()
                .webhook(NotifyConfig.WebhookNotify.builder().url(WEBHOOK_URL).trigger(trigger).build())
                .build();
    }

    private NotifyConfig email(NotifyTrigger trigger) {
        return NotifyConfig.builder()
                .email(NotifyConfig.EmailNotify.builder()
                        .recipients(EMAIL_RECIPIENTS).trigger(trigger).build())
                .build();
    }

    /** 同时配置 webhook + email */
    private NotifyConfig both(NotifyTrigger wbTrigger, NotifyTrigger mailTrigger) {
        return NotifyConfig.builder()
                .webhook(NotifyConfig.WebhookNotify.builder().url(WEBHOOK_URL).trigger(wbTrigger).build())
                .email(NotifyConfig.EmailNotify.builder()
                        .recipients(EMAIL_RECIPIENTS).trigger(mailTrigger).build())
                .build();
    }

    private void stubFetchOk() {
        when(httpFetcher.fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong()))
                .thenReturn(new HttpFetcher.HttpFetchResult(200, "OK", WEBHOOK_URL, null, 88, ""));
    }

    // ------------------------------------------------------------
    // Webhook 通道
    // ------------------------------------------------------------

    @DisplayName("ON_FAILURE + FAILED → 发送，payload 含任务/执行信息与 detailUrl")
    @Test
    void onFailureSendsPayload() throws Exception {
        stubFetchOk();
        service.onExecutionFinished(task(webhook(NotifyTrigger.ON_FAILURE)), execution(ExecutionStatus.FAILED));

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(httpFetcher).fetchWithBody(eq(WEBHOOK_URL), eq("POST"), any(), body.capture(), eq(10_000L));
        JsonNode json = objectMapper.readTree(body.getValue());
        assertThat(json.get("taskId").asLong()).isEqualTo(7L);
        assertThat(json.get("taskName").asText()).isEqualTo("健康检查");
        assertThat(json.get("executionId").asLong()).isEqualTo(900L);
        assertThat(json.get("status").asText()).isEqualTo("FAILED");
        assertThat(json.get("triggerType").asText()).isEqualTo("SCHEDULED");
        assertThat(json.get("durationMs").asInt()).isEqualTo(1200);
        assertThat(json.get("retryCount").asInt()).isEqualTo(1);
        assertThat(json.get("error").asText()).isEqualTo("HTTP 503");
        assertThat(json.get("detailUrl").asText())
                .isEqualTo("https://tool.example.com/tools/task-scheduler/7");
        // triggeredAt 输出 UTC ISO-8601（带 Z）；期望值与时区无关地计算
        String expectedTriggeredAt = LocalDateTime.of(2026, 9, 11, 9, 0)
                .atZone(ZoneId.systemDefault()).toInstant().toString();
        assertThat(json.get("triggeredAt").asText()).isEqualTo(expectedTriggeredAt);
    }

    @DisplayName("Webhook 触发矩阵：ALWAYS 全发 / ON_FAILURE 仅失败侧 / ON_SUCCESS 仅成功 / SKIPPED 不发")
    @Test
    void webhookTriggerMatrix() {
        stubFetchOk();

        service.onExecutionFinished(task(webhook(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.SUCCESS));
        service.onExecutionFinished(task(webhook(NotifyTrigger.ON_FAILURE)), execution(ExecutionStatus.FAILED));
        service.onExecutionFinished(task(webhook(NotifyTrigger.ON_FAILURE)), execution(ExecutionStatus.TIMEOUT));
        service.onExecutionFinished(task(webhook(NotifyTrigger.ON_FAILURE)), execution(ExecutionStatus.SUCCESS));
        service.onExecutionFinished(task(webhook(NotifyTrigger.ON_SUCCESS)), execution(ExecutionStatus.SUCCESS));
        service.onExecutionFinished(task(webhook(NotifyTrigger.ON_SUCCESS)), execution(ExecutionStatus.FAILED));
        service.onExecutionFinished(task(webhook(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.SKIPPED));

        // 发送：ALWAYS+成功、ON_FAILURE+失败、ON_FAILURE+超时、ON_SUCCESS+成功 = 4 次；其余 3 组跳过
        verify(httpFetcher, org.mockito.Mockito.times(4)).fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong());
    }

    @DisplayName("未配置通知 / webhook URL 为空 → 不发送")
    @Test
    void skipsWhenNotConfigured() {
        stubFetchOk();
        service.onExecutionFinished(task(null), execution(ExecutionStatus.FAILED));
        service.onExecutionFinished(task(NotifyConfig.builder().build()), execution(ExecutionStatus.FAILED));
        service.onExecutionFinished(task(webhook(NotifyTrigger.ALWAYS)), null);

        verify(httpFetcher, never()).fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong());
    }

    @DisplayName("SSRF 拦截 / URL 无主机 / 非 http(s) 协议 → 跳过发送，不抛出")
    @Test
    void skipsWhenUrlRejected() throws Exception {
        when(ssrfProtector.resolveAndValidate("127.0.0.1"))
                .thenThrow(new BusinessException("NETWORK_SSRF_BLOCKED", "内网地址", 400));

        NotifyConfig internal = NotifyConfig.builder()
                .webhook(NotifyConfig.WebhookNotify.builder().url("http://127.0.0.1/hook").trigger(NotifyTrigger.ALWAYS).build())
                .build();
        NotifyConfig noHost = NotifyConfig.builder()
                .webhook(NotifyConfig.WebhookNotify.builder().url("not-a-url").trigger(NotifyTrigger.ALWAYS).build())
                .build();
        NotifyConfig badScheme = NotifyConfig.builder()
                .webhook(NotifyConfig.WebhookNotify.builder().url("ftp://example.com/hook").trigger(NotifyTrigger.ALWAYS).build())
                .build();

        assertThatCode(() -> service.onExecutionFinished(task(internal), execution(ExecutionStatus.FAILED)))
                .doesNotThrowAnyException();
        assertThatCode(() -> service.onExecutionFinished(task(noHost), execution(ExecutionStatus.FAILED)))
                .doesNotThrowAnyException();
        assertThatCode(() -> service.onExecutionFinished(task(badScheme), execution(ExecutionStatus.FAILED)))
                .doesNotThrowAnyException();
        verify(httpFetcher, never()).fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong());
    }

    @DisplayName("回调非 2xx / 抛异常 → 仅记日志，不向上抛出")
    @Test
    void swallowsWebhookFailures() {
        when(httpFetcher.fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong()))
                .thenReturn(new HttpFetcher.HttpFetchResult(500, "ISE", WEBHOOK_URL, null, 30, ""))
                .thenThrow(new HttpFetcher.HttpFetchException("connect failed", new RuntimeException(), 12));

        assertThatCode(() -> service.onExecutionFinished(
                task(webhook(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.FAILED)))
                .doesNotThrowAnyException();
        assertThatCode(() -> service.onExecutionFinished(
                task(webhook(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.FAILED)))
                .doesNotThrowAnyException();
        verify(httpFetcher, org.mockito.Mockito.times(2)).fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong());
    }

    @DisplayName("frontend-base-url 为空 → payload 不带 detailUrl")
    @Test
    void detailUrlOmittedWithoutBaseUrl() throws Exception {
        ReflectionTestUtils.setField(service, "frontendBaseUrl", "");
        stubFetchOk();
        service.onExecutionFinished(task(webhook(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.SUCCESS));

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(httpFetcher).fetchWithBody(anyString(), anyString(), any(), body.capture(), anyLong());
        JsonNode json = objectMapper.readTree(body.getValue());
        assertThat(json.get("detailUrl").isNull()).isTrue();
    }

    // ------------------------------------------------------------
    // 邮件通道
    // ------------------------------------------------------------

    @DisplayName("ON_FAILURE + FAILED → 发送邮件，主题/收件人/正文包含关键信息")
    @Test
    void emailSendsContent() throws Exception {
        stubFetchOk();
        service.onExecutionFinished(task(email(NotifyTrigger.ON_FAILURE)), execution(ExecutionStatus.FAILED));

        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(captor.capture());
        MimeMessage msg = captor.getValue();
        // Subject 自动解码 Base64 MIME 编码
        assertThat(msg.getSubject()).contains("健康检查").contains("FAILED");
        assertThat(msg.getAllRecipients()).hasSize(EMAIL_RECIPIENTS.size());
        // 正文用 writeTo 提取原始邮件文本；quoted-printable 软换行（=\n）会打断 ASCII 字符串，需先去除
        String raw = dumpMessage(msg).replaceAll("=\r?\n", "");
        assertThat(raw).contains("FAILED").contains("HTTP 503");
        assertThat(raw).contains("https://tool.example.com/tools/task-scheduler/7");
    }

    @DisplayName("邮件触发矩阵：ALWAYS 全发 / ON_FAILURE 仅失败侧 / ON_SUCCESS 仅成功 / SKIPPED 不发")
    @Test
    void emailTriggerMatrix() {
        stubFetchOk();

        service.onExecutionFinished(task(email(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.SUCCESS));
        service.onExecutionFinished(task(email(NotifyTrigger.ON_FAILURE)), execution(ExecutionStatus.FAILED));
        service.onExecutionFinished(task(email(NotifyTrigger.ON_FAILURE)), execution(ExecutionStatus.TIMEOUT));
        service.onExecutionFinished(task(email(NotifyTrigger.ON_FAILURE)), execution(ExecutionStatus.SUCCESS));
        service.onExecutionFinished(task(email(NotifyTrigger.ON_SUCCESS)), execution(ExecutionStatus.SUCCESS));
        service.onExecutionFinished(task(email(NotifyTrigger.ON_SUCCESS)), execution(ExecutionStatus.FAILED));
        service.onExecutionFinished(task(email(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.SKIPPED));

        verify(mailSender, org.mockito.Mockito.times(4)).send(any(MimeMessage.class));
    }

    @DisplayName("mailSender 未配置（null）→ 邮件通道静默跳过，不抛出")
    @Test
    void emailSkipsWhenMailSenderNull() {
        ReflectionTestUtils.setField(service, "mailSender", (Object) null);
        stubFetchOk();

        assertThatCode(() -> service.onExecutionFinished(
                task(email(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.FAILED)))
                .doesNotThrowAnyException();
        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @DisplayName("邮件发送异常 → 仅记日志，不向上抛出")
    @Test
    void emailSwallowsFailures() {
        doThrowOnSend();
        stubFetchOk();

        assertThatCode(() -> service.onExecutionFinished(
                task(email(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.FAILED)))
                .doesNotThrowAnyException();
        verify(mailSender).send(any(MimeMessage.class));
    }

    @DisplayName("frontend-base-url 为空 → 邮件正文不含详情链接")
    @Test
    void emailDetailUrlOmittedWithoutBaseUrl() throws Exception {
        ReflectionTestUtils.setField(service, "frontendBaseUrl", "");
        stubFetchOk();
        service.onExecutionFinished(task(email(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.SUCCESS));

        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(captor.capture());
        // 正文不含详情链接路径（ASCII 安全断言）
        String raw = dumpMessage(captor.getValue()).replaceAll("=\r?\n", "");
        assertThat(raw).doesNotContain("/tools/task-scheduler/");
    }

    // ------------------------------------------------------------
    // 双通道独立
    // ------------------------------------------------------------

    @DisplayName("webhook 失败不影响邮件发送 / 邮件失败不影响 webhook 发送")
    @Test
    void dualChannelIndependent() {
        // webhook 抛异常，邮件正常
        when(httpFetcher.fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong()))
                .thenThrow(new HttpFetcher.HttpFetchException("connect failed", new RuntimeException(), 12));

        assertThatCode(() -> service.onExecutionFinished(
                task(both(NotifyTrigger.ALWAYS, NotifyTrigger.ALWAYS)), execution(ExecutionStatus.FAILED)))
                .doesNotThrowAnyException();
        // webhook 尝试了（抛异常被吞）
        verify(httpFetcher).fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong());
        // 邮件仍然发出
        verify(mailSender).send(any(MimeMessage.class));
    }

    @DisplayName("仅配置 webhook → 邮件不发送 / 仅配置邮件 → webhook 不发送")
    @Test
    void singleChannelDoesNotTriggerOther() {
        stubFetchOk();
        service.onExecutionFinished(task(webhook(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.FAILED));
        verify(mailSender, never()).send(any(MimeMessage.class));

        service.onExecutionFinished(task(email(NotifyTrigger.ALWAYS)), execution(ExecutionStatus.FAILED));
        verify(httpFetcher, org.mockito.Mockito.times(1))
                .fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong());
    }

    // ------------------------------------------------------------
    // 辅助
    // ------------------------------------------------------------

    private void doThrowOnSend() {
        org.mockito.Mockito.doThrow(new RuntimeException("SMTP error"))
                .when(mailSender).send(any(MimeMessage.class));
    }

    /** 将 MimeMessage 序列化为原始文本（含 headers + body），用于 ASCII 安全的内容断言 */
    private String dumpMessage(MimeMessage msg) throws Exception {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        msg.writeTo(baos);
        return baos.toString("UTF-8");
    }
}
