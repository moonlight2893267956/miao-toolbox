package com.miao.toolbox.tool.regex;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import com.miao.toolbox.tool.regex.dto.RegexAIRequest;
import com.miao.toolbox.tool.regex.dto.RegexAIResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * RegexAIService 单元测试：覆盖五种任务的输入组装（buildInput）与结果解析（parseResponse）。
 *
 * <p>通过 mock 的 MiaoAiClient 返回构造好的 output，并用 ArgumentCaptor 捕获传入 Agent 的 input，
 * 从而同时验证 buildInput 的字段组装与 parseResponse 的字段解析，无需真实网络调用。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("RegexAIService 测试")
class RegexAIServiceTest {

    @Mock
    private MiaoAiClient miaoAiClient;

    @Mock
    private MiaoAiProperties miaoAiProperties;

    @Captor
    private ArgumentCaptor<Map<String, Object>> inputCaptor;

    @Captor
    private ArgumentCaptor<Map<String, Object>> metadataCaptor;

    private RegexAIService service;

    @BeforeEach
    void setUp() {
        MiaoAiProperties.AgentConfig agentConfig = new MiaoAiProperties.AgentConfig();
        agentConfig.setEnabled(true);
        when(miaoAiProperties.getAgent("regex-assistant")).thenReturn(agentConfig);
        service = new RegexAIService(miaoAiClient, miaoAiProperties, new ObjectMapper());
    }

    /** 构造一个 Agent 返回结果 */
    private void stubAgentResponse(Map<String, Object> output, String model, String traceId) {
        MiaoAiInvokeResponse response = MiaoAiInvokeResponse.builder()
                .mode("stream")
                .output(output)
                .model(model)
                .traceId(traceId)
                .latencyMs(1234)
                .build();
        when(miaoAiClient.invoke(eq("regex-assistant"), any(), any())).thenReturn(response);
    }

    @Test
    @DisplayName("generate：input 含 description+engine，output 解析 pattern/explanation")
    void generate_buildsAndParses() {
        stubAgentResponse(Map.of("pattern", "1[3-9]\\d{9}", "engine", "js",
                "explanation", "匹配手机号"), "gpt-4o", "t-1");

        RegexAIResponse r = service.invoke(new RegexAIRequest() {{
            setTask("generate");
            setDescription("匹配中国大陆11位手机号");
            setEngine("js");
        }});

        verify(miaoAiClient).invoke(eq("regex-assistant"), inputCaptor.capture(), any());
        assertEquals("generate", inputCaptor.getValue().get("task"));
        assertEquals("匹配中国大陆11位手机号", inputCaptor.getValue().get("description"));
        assertEquals("js", inputCaptor.getValue().get("engine"));

        assertEquals("1[3-9]\\d{9}", r.getPattern());
        assertEquals("js", r.getEngine());
        assertEquals("匹配手机号", r.getExplanation());
        assertEquals("t-1", r.getTraceId());
    }

    @Test
    @DisplayName("explain：input 含 pattern+flags+engine，output 解析 explanation")
    void explain_buildsAndParses() {
        stubAgentResponse(Map.of("pattern", "\\d+", "explanation", "匹配数字"), "gpt-4o", "t-2");

        RegexAIResponse r = service.invoke(new RegexAIRequest() {{
            setTask("explain");
            setPattern("\\d+");
            setFlags("g");
            setEngine("js");
        }});

        verify(miaoAiClient).invoke(eq("regex-assistant"), inputCaptor.capture(), any());
        assertEquals("\\d+", inputCaptor.getValue().get("pattern"));
        assertEquals("g", inputCaptor.getValue().get("flags"));
        assertEquals("js", inputCaptor.getValue().get("engine"));

        assertEquals("匹配数字", r.getExplanation());
        assertEquals("\\d+", r.getPattern());
    }

    @Test
    @DisplayName("optimize：output 解析 suggestions 列表（每条内嵌表达式）")
    void optimize_parsesSuggestions() {
        stubAgentResponse(Map.of("explanation", "可简化",
                "suggestions", List.of("\\d+ — 用 \\d 替代 [0-9]", "[0-9]{1,} — 等价写法")),
                "gpt-4o", "t-3");

        RegexAIResponse r = service.invoke(new RegexAIRequest() {{
            setTask("optimize");
            setPattern("[0-9]+");
        }});

        assertEquals(2, r.getSuggestions().size());
        assertTrue(r.getSuggestions().get(0).contains("\\d+"));
        assertEquals("可简化", r.getExplanation());
    }

    @Test
    @DisplayName("diagnose：input 含 pattern+samples，output 解析 diagnosis+pattern+originalPattern")
    void diagnose_buildsAndParses() {
        stubAgentResponse(Map.of("pattern", ".*\\d+.*", "originalPattern", "\\d+",
                "diagnosis", "需放宽锚定"), "gpt-4o", "t-4");

        RegexAIResponse r = service.invoke(new RegexAIRequest() {{
            setTask("diagnose");
            setPattern("\\d+");
            setSamples(List.of("abc123", "price: 9"));
        }});

        verify(miaoAiClient).invoke(eq("regex-assistant"), inputCaptor.capture(), any());
        @SuppressWarnings("unchecked")
        List<String> samples = (List<String>) inputCaptor.getValue().get("samples");
        assertEquals(2, samples.size());
        assertEquals("abc123", samples.get(0));

        assertEquals(".*\\d+.*", r.getPattern());
        assertEquals("\\d+", r.getOriginalPattern());
        assertEquals("需放宽锚定", r.getDiagnosis());
    }

    @Test
    @DisplayName("convert：input 含 pattern+engine+targetEngine，output 解析 convertedPattern+engine")
    void convert_buildsAndParses() {
        stubAgentResponse(Map.of("convertedPattern", "新的表达式", "engine", "js",
                "originalPattern", "(?<=@)\\w+", "explanation", "JS 不支持后行断言"),
                "gpt-4o", "t-5");

        RegexAIResponse r = service.invoke(new RegexAIRequest() {{
            setTask("convert");
            setPattern("(?<=@)\\w+");
            setEngine("pcre");
            setTargetEngine("js");
        }});

        verify(miaoAiClient).invoke(eq("regex-assistant"), inputCaptor.capture(), any());
        assertEquals("pcre", inputCaptor.getValue().get("engine"));
        assertEquals("js", inputCaptor.getValue().get("targetEngine"));

        assertEquals("新的表达式", r.getConvertedPattern());
        assertEquals("js", r.getEngine());
        assertEquals("JS 不支持后行断言", r.getExplanation());
    }

    @Test
    @DisplayName("禁用 Agent 时抛 AI_AGENT_DISABLED")
    void disabledAgent_throws() {
        MiaoAiProperties.AgentConfig disabled = new MiaoAiProperties.AgentConfig();
        disabled.setEnabled(false);
        when(miaoAiProperties.getAgent("regex-assistant")).thenReturn(disabled);

        com.miao.toolbox.common.exception.BusinessException ex = org.junit.jupiter.api.Assertions.assertThrows(
                com.miao.toolbox.common.exception.BusinessException.class,
                () -> service.invoke(new RegexAIRequest() {{
                    setTask("generate");
                    setDescription("x");
                }}));
        assertEquals("AI_AGENT_DISABLED", ex.getErrorCode());
    }

    @Test
    @DisplayName("Agent 未配置时抛 AI_AGENT_NOT_CONFIGURED")
    void notConfiguredAgent_throws() {
        when(miaoAiProperties.getAgent("regex-assistant"))
                .thenThrow(new com.miao.toolbox.common.exception.BusinessException(
                        "AI_AGENT_NOT_CONFIGURED", "not configured", 503));

        com.miao.toolbox.common.exception.BusinessException ex = org.junit.jupiter.api.Assertions.assertThrows(
                com.miao.toolbox.common.exception.BusinessException.class,
                () -> service.invoke(new RegexAIRequest() {{
                    setTask("generate");
                    setDescription("x");
                }}));
        assertEquals("AI_AGENT_NOT_CONFIGURED", ex.getErrorCode());
    }
}
