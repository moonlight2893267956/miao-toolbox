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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

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
 * NotificationService 单元测试（FR-10）：触发矩阵 / SSRF 拦截 / 失败仅记日志 / payload 结构。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("NotificationService 执行通知")
class NotificationServiceTest {

    private static final String WEBHOOK_URL = "https://hook.example.com/xyz";

    @Mock
    private HttpFetcher httpFetcher;

    @Mock
    private SsrfProtector ssrfProtector;

    private NotificationService service;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = new NotificationService(httpFetcher, ssrfProtector, objectMapper);
        ReflectionTestUtils.setField(service, "frontendBaseUrl", "https://tool.example.com");
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

    private void stubFetchOk() {
        when(httpFetcher.fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong()))
                .thenReturn(new HttpFetcher.HttpFetchResult(200, "OK", WEBHOOK_URL, null, 88, ""));
    }

    // ------------------------------------------------------------
    // 触发矩阵
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
    }

    @DisplayName("触发矩阵：ALWAYS 全发 / ON_FAILURE 仅失败侧 / ON_SUCCESS 仅成功 / SKIPPED 不发")
    @Test
    void triggerMatrix() {
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

    // ------------------------------------------------------------
    // 安全与失败语义
    // ------------------------------------------------------------

    @DisplayName("SSRF 拦截 / URL 无主机 → 跳过发送，不抛出")
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

        assertThatCode(() -> service.onExecutionFinished(task(internal), execution(ExecutionStatus.FAILED)))
                .doesNotThrowAnyException();
        assertThatCode(() -> service.onExecutionFinished(task(noHost), execution(ExecutionStatus.FAILED)))
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
}
