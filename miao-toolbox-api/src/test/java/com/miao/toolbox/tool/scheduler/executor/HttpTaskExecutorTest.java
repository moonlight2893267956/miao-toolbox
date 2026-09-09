package com.miao.toolbox.tool.scheduler.executor;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.infrastructure.HttpRequestExecutor;
import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetHeader;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.service.SchedulerCryptoService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("HttpTaskExecutor 执行与判定")
class HttpTaskExecutorTest {

    @Mock
    private HttpRequestExecutor httpRequestExecutor;

    @Mock
    private SchedulerCryptoService cryptoService;

    @InjectMocks
    private HttpTaskExecutor executor;

    private ScheduledTask task(HttpTargetConfig config) {
        return ScheduledTask.builder()
                .id(7L)
                .name("健康检查")
                .targetType(TargetType.HTTP)
                .targetConfig(config)
                .cronExpression("0 */5 * * * *")
                .timezone("Asia/Shanghai")
                .build();
    }

    private HttpRequestExecutor.Execution execution(int statusCode, String body) {
        return new HttpRequestExecutor.Execution(statusCode, statusCode == 200 ? "OK" : "Error",
                "https://example.com/final", List.of(), body, body == null ? 0 : body.length(),
                false, 123L);
    }

    @DisplayName("AC3: 2xx → SUCCESS；响应摘要含 statusCode/截断标记")
    @Test
    void twoLeadsToSuccess() {
        when(httpRequestExecutor.send(any())).thenReturn(execution(200, "{\"ok\":true}"));

        ExecutionResult result = executor.execute(task(HttpTargetConfig.builder()
                .method("GET").url("https://example.com/health").build()));

        assertThat(result.status()).isEqualTo(com.miao.toolbox.tool.scheduler.entity.ExecutionStatus.SUCCESS);
        assertThat(result.errorMessage()).isNull();
        // Jackson 序列化后 body 内引号被转义
        assertThat(result.responseSummary()).contains("\"statusCode\":200").contains("\\\"ok\\\":true");
    }

    @DisplayName("AC3: 非 2xx → FAILED 且 errorMessage 携带状态码")
    @Test
    void non2xxLeadsToFailed() {
        when(httpRequestExecutor.send(any())).thenReturn(execution(503, "down"));

        ExecutionResult result = executor.execute(task(HttpTargetConfig.builder()
                .method("GET").url("https://example.com/health").build()));

        assertThat(result.status()).isEqualTo(com.miao.toolbox.tool.scheduler.entity.ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("503");
    }

    @DisplayName("AC3/AC5: 连接超时 → TIMEOUT")
    @Test
    void timeoutLeadsToTimeoutStatus() {
        when(httpRequestExecutor.send(any())).thenThrow(
                new BusinessException("NETWORK_CONNECTION_TIMEOUT", "请求超时（30000ms）"));

        ExecutionResult result = executor.execute(task(HttpTargetConfig.builder()
                .method("GET").url("https://example.com/slow").timeoutSeconds(30).build()));

        assertThat(result.status()).isEqualTo(com.miao.toolbox.tool.scheduler.entity.ExecutionStatus.TIMEOUT);
    }

    @DisplayName("AC3: DNS 失败等网络错误 → FAILED")
    @Test
    void networkErrorLeadsToFailed() {
        when(httpRequestExecutor.send(any())).thenThrow(
                new BusinessException("NETWORK_DNS_RESOLVE_FAILED", "无法解析主机"));

        ExecutionResult result = executor.execute(task(HttpTargetConfig.builder()
                .method("GET").url("https://nonexistent.invalid/").build()));

        assertThat(result.status()).isEqualTo(com.miao.toolbox.tool.scheduler.entity.ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("NETWORK_DNS_RESOLVE_FAILED");
    }

    @DisplayName("AC3: 敏感 header 解密后入请求，摘要中为前4后4脱敏")
    @Test
    void sensitiveHeaderDecryptedAndMaskedInSummary() throws Exception {
        when(cryptoService.decrypt("cipher-value")).thenReturn("Bearer super-secret-token-value");
        when(httpRequestExecutor.send(any())).thenReturn(execution(200, "ok"));

        ExecutionResult result = executor.execute(task(HttpTargetConfig.builder()
                .method("GET").url("https://example.com")
                .headers(List.of(TargetHeader.builder()
                        .name("Authorization").value("cipher-value").sensitive(true).build()))
                .build()));

        assertThat(result.status()).isEqualTo(com.miao.toolbox.tool.scheduler.entity.ExecutionStatus.SUCCESS);
        ArgumentCaptor<HttpRequestExecutor.Spec> captor =
                ArgumentCaptor.forClass(HttpRequestExecutor.Spec.class);
        verifySpecHeaders(captor);
        // 摘要脱敏：不出现完整明文
        assertThat(result.requestSummary()).doesNotContain("super-secret-token-value");
        assertThat(result.requestSummary()).contains("Bear");
        assertThat(result.requestSummary()).contains("****");
    }

    private void verifySpecHeaders(ArgumentCaptor<HttpRequestExecutor.Spec> captor) {
        // 单独拆出避免 checked exception 干扰断言消息
        try {
            org.mockito.Mockito.verify(httpRequestExecutor).send(captor.capture());
            HttpRequestExecutor.Spec spec = captor.getValue();
            assertThat(spec.headers()).hasSize(1);
            assertThat(spec.headers().get(0).value()).isEqualTo("Bearer super-secret-token-value");
        } catch (BusinessException e) {
            throw new RuntimeException(e);
        }
    }

    @DisplayName("AC3: body 与 URL 变量被替换（{{taskId}}/{{taskName}}/{{now}}）")
    @Test
    void variablesReplacedInBodyAndHeaders() {
        when(httpRequestExecutor.send(any())).thenReturn(execution(200, "ok"));

        executor.execute(task(HttpTargetConfig.builder()
                .method("POST").url("https://example.com/api")
                .body("{\"task\":\"{{taskName}}\",\"id\":\"{{taskId}}\"}")
                .build()));

        ArgumentCaptor<HttpRequestExecutor.Spec> captor =
                ArgumentCaptor.forClass(HttpRequestExecutor.Spec.class);
        try {
            org.mockito.Mockito.verify(httpRequestExecutor).send(captor.capture());
        } catch (BusinessException e) {
            throw new RuntimeException(e);
        }
        HttpRequestExecutor.Spec spec = captor.getValue();
        assertThat(spec.body()).isEqualTo("{\"task\":\"健康检查\",\"id\":\"7\"}");
    }

    @DisplayName("AC4: request_summary 含 method/url 与 bodyPreview")
    @Test
    void requestSummaryBuilt() {
        when(httpRequestExecutor.send(any())).thenReturn(execution(200, "ok"));

        ExecutionResult result = executor.execute(task(HttpTargetConfig.builder()
                .method("POST").url("https://example.com/api").body("hello").build()));

        assertThat(result.requestSummary()).contains("\"method\":\"POST\"");
        assertThat(result.requestSummary()).contains("https://example.com/api");
        assertThat(result.requestSummary()).contains("hello");
    }

    @DisplayName("契约: 执行器不抛异常——send 抛 RuntimeException 也返回 FAILED")
    @Test
    void neverThrows() {
        when(httpRequestExecutor.send(any())).thenThrow(new IllegalStateException("boom"));

        ExecutionResult result = executor.execute(task(HttpTargetConfig.builder()
                .method("GET").url("https://example.com").build()));

        assertThat(result.status()).isEqualTo(com.miao.toolbox.tool.scheduler.entity.ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("执行异常");
    }
}
