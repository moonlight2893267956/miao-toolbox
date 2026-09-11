package com.miao.toolbox.tool.scheduler.executor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.PresetTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * PresetTaskExecutor + CleanExecutionLogsHandler 单元测试（FR-5/FR-8）：
 * 模板分发 / 参数校验 / 清理执行 / 未知模板 / 缺配置 / 响应摘要结构。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("预置模板执行器")
class PresetTaskExecutorTest {

    @Mock
    private TaskExecutionRepository executionRepository;

    private PresetTaskExecutor executor;
    private CleanExecutionLogsHandler cleanHandler;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        cleanHandler = new CleanExecutionLogsHandler(executionRepository);
        executor = new PresetTaskExecutor(List.of(cleanHandler));
    }

    private ScheduledTask presetTask(String template, Map<String, Object> params) {
        return ScheduledTask.builder()
                .id(10L)
                .name("日志清理")
                .targetType(TargetType.PRESET)
                .targetConfig(PresetTargetConfig.builder()
                        .template(template)
                        .params(params)
                        .build())
                .build();
    }

    // ------------------------------------------------------------
    // CleanExecutionLogsHandler
    // ------------------------------------------------------------

    @DisplayName("CLEAN_EXECUTION_LOGS: 删除指定天数前的执行记录，返回 deleted 计数")
    @Test
    void cleanExecutionLogsSuccess() throws Exception {
        when(executionRepository.deleteByTriggeredAtBefore(any(LocalDateTime.class)))
                .thenReturn(128L);

        ExecutionResult result = executor.execute(presetTask("CLEAN_EXECUTION_LOGS", Map.of("retentionDays", 30)));

        assertThat(result.status()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(result.errorMessage()).isNull();
        // responseSummary 含 deleted=128
        JsonNode resp = objectMapper.readTree(result.responseSummary());
        assertThat(resp.get("template").asText()).isEqualTo("CLEAN_EXECUTION_LOGS");
        assertThat(resp.get("retentionDays").asInt()).isEqualTo(30);
        assertThat(resp.get("deleted").asLong()).isEqualTo(128L);
        assertThat(resp.has("cutoff")).isTrue();
    }

    @DisplayName("retentionDays 缺省 → 默认 30 天")
    @Test
    void cleanExecutionLogsDefaultRetention() throws Exception {
        when(executionRepository.deleteByTriggeredAtBefore(any(LocalDateTime.class)))
                .thenReturn(5L);

        ExecutionResult result = executor.execute(presetTask("CLEAN_EXECUTION_LOGS", null));

        assertThat(result.status()).isEqualTo(ExecutionStatus.SUCCESS);
        JsonNode resp = objectMapper.readTree(result.responseSummary());
        assertThat(resp.get("retentionDays").asInt()).isEqualTo(30);
    }

    @DisplayName("retentionDays 超范围(0) → FAILED")
    @Test
    void cleanExecutionLogsRetentionOutOfRange() {
        ExecutionResult result = executor.execute(
                presetTask("CLEAN_EXECUTION_LOGS", Map.of("retentionDays", 0)));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("retentionDays");
    }

    @DisplayName("retentionDays 非整数 → FAILED")
    @Test
    void cleanExecutionLogsRetentionNotInteger() {
        ExecutionResult result = executor.execute(
                presetTask("CLEAN_EXECUTION_LOGS", Map.of("retentionDays", "abc")));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("retentionDays");
    }

    @DisplayName("retentionDays 字符串数字可解析 → 正常执行")
    @Test
    void cleanExecutionLogsRetentionStringNumber() throws Exception {
        when(executionRepository.deleteByTriggeredAtBefore(any(LocalDateTime.class)))
                .thenReturn(3L);

        ExecutionResult result = executor.execute(
                presetTask("CLEAN_EXECUTION_LOGS", Map.of("retentionDays", "60")));

        assertThat(result.status()).isEqualTo(ExecutionStatus.SUCCESS);
        JsonNode resp = objectMapper.readTree(result.responseSummary());
        assertThat(resp.get("retentionDays").asInt()).isEqualTo(60);
    }

    // ------------------------------------------------------------
    // 分发与边界
    // ------------------------------------------------------------

    @DisplayName("未知模板代码 → FAILED")
    @Test
    void unknownTemplate() {
        ExecutionResult result = executor.execute(presetTask("UNKNOWN_TEMPLATE", Map.of()));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("未知预置模板");
    }

    @DisplayName("template 为空 → FAILED")
    @Test
    void emptyTemplate() {
        ExecutionResult result = executor.execute(presetTask("", Map.of()));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("缺少 template");
    }

    @DisplayName("requestSummary 含模板代码与参数快照")
    @Test
    void requestSummaryStructure() throws Exception {
        when(executionRepository.deleteByTriggeredAtBefore(any(LocalDateTime.class)))
                .thenReturn(0L);

        ExecutionResult result = executor.execute(
                presetTask("CLEAN_EXECUTION_LOGS", Map.of("retentionDays", 14)));

        JsonNode req = objectMapper.readTree(result.requestSummary());
        assertThat(req.get("template").asText()).isEqualTo("CLEAN_EXECUTION_LOGS");
        assertThat(req.get("params").get("retentionDays").asInt()).isEqualTo(14);
    }

    @DisplayName("handler 抛未预期异常 → 执行器兜底转为 FAILED")
    @Test
    void handlerThrowsIsCaught() {
        when(executionRepository.deleteByTriggeredAtBefore(any(LocalDateTime.class)))
                .thenThrow(new RuntimeException("DB down"));

        ExecutionResult result = executor.execute(
                presetTask("CLEAN_EXECUTION_LOGS", Map.of("retentionDays", 30)));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("DB down");
    }

    @DisplayName("paramSchema 返回 retentionDays 描述")
    @Test
    void paramSchemaContainsRetentionDays() {
        Map<String, String> schema = cleanHandler.paramSchema();
        assertThat(schema).containsKey("retentionDays");
        assertThat(schema.get("retentionDays")).contains("1-365");
    }

    // ------------------------------------------------------------
    // 模板列表（GET /preset-templates）
    // ------------------------------------------------------------

    @DisplayName("listTemplates: 返回注册模板的元信息（code/name/description/params）")
    @Test
    void listTemplatesReturnsRegisteredMetadata() {
        List<com.miao.toolbox.tool.scheduler.dto.PresetTemplateResponse> templates = executor.listTemplates();

        assertThat(templates).hasSize(1);
        com.miao.toolbox.tool.scheduler.dto.PresetTemplateResponse t = templates.get(0);
        assertThat(t.getCode()).isEqualTo("CLEAN_EXECUTION_LOGS");
        assertThat(t.getName()).isEqualTo("清理过期执行日志");
        assertThat(t.getDescription()).isNotBlank();
        assertThat(t.getParams()).containsKey("retentionDays");
    }

    @DisplayName("listTemplates: 多 handler 按注册顺序返回全部")
    @Test
    void listTemplatesReturnsAllHandlers() {
        PresetTemplateHandler second = new PresetTemplateHandler() {
            @Override public String templateCode() { return "SECOND_TEMPLATE"; }
            @Override public String displayName() { return "第二个模板"; }
            @Override public String description() { return "测试用"; }
            @Override public Map<String, String> paramSchema() { return Map.of(); }
            @Override public PresetExecutionResult execute(PresetTargetConfig config) {
                return PresetExecutionResult.success("{}");
            }
        };
        PresetTaskExecutor twoHandlerExecutor = new PresetTaskExecutor(List.of(cleanHandler, second));

        List<com.miao.toolbox.tool.scheduler.dto.PresetTemplateResponse> templates = twoHandlerExecutor.listTemplates();

        assertThat(templates).hasSize(2);
        assertThat(templates).extracting(
                com.miao.toolbox.tool.scheduler.dto.PresetTemplateResponse::getCode)
                .containsExactly("CLEAN_EXECUTION_LOGS", "SECOND_TEMPLATE");
    }
}
