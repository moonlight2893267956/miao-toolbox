package com.miao.toolbox.tool.translate;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import com.miao.toolbox.tool.translate.dto.AiEnhanceRequest;
import com.miao.toolbox.tool.translate.dto.AiEnhanceResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("AiEnhanceService 调用 translate-agent 测试")
class AiEnhanceServiceTest {

    @Mock
    private MiaoAiClient miaoAiClient;

    @InjectMocks
    private AiEnhanceService aiEnhanceService;

    @Test
    @DisplayName("enhance 正常返回 translated 并透传 tone/text/task")
    void enhance_success() {
        Map<String, Object> output = Map.of(
                "task", "translate",
                "translated", "Hello world",
                "mt_draft", "你好世界",
                "notes", "baidu degraded"
        );
        when(miaoAiClient.invoke(eq("translate-agent"), anyMap(), anyMap()))
                .thenReturn(MiaoAiInvokeResponse.builder().output(output).build());

        AiEnhanceRequest req = new AiEnhanceRequest();
        req.setText("你好世界");
        req.setTargetLang("en");
        req.setTone("formal");
        req.setTask("translate");

        AiEnhanceResponse result = aiEnhanceService.enhance(req);
        assertEquals("Hello world", result.getTranslated());
        assertEquals("你好世界", result.getMtDraft());
        assertEquals("baidu degraded", result.getNotes());

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(miaoAiClient).invoke(eq("translate-agent"), captor.capture(), anyMap());
        Map<String, Object> sent = captor.getValue();
        assertEquals("你好世界", sent.get("text"));
        assertEquals("formal", sent.get("tone"));
        assertEquals("translate", sent.get("task"));
        assertEquals("en", sent.get("target_lang"));
    }

    @Test
    @DisplayName("enhance output 无 translated → 抛 AI_ANALYSIS_FAILED(502)")
    void enhance_emptyTranslated_throws() {
        when(miaoAiClient.invoke(anyString(), anyMap(), anyMap()))
                .thenReturn(MiaoAiInvokeResponse.builder().output(Map.of("task", "translate")).build());

        AiEnhanceRequest req = new AiEnhanceRequest();
        req.setText("x");

        BusinessException ex = assertThrows(BusinessException.class, () -> aiEnhanceService.enhance(req));
        assertEquals("AI_ANALYSIS_FAILED", ex.getErrorCode());
        assertEquals(502, ex.getHttpStatus());
    }

    @Test
    @DisplayName("enhance 下游抛 503 → 向上传播")
    void enhance_downstreamUnavailable_propagates() {
        when(miaoAiClient.invoke(anyString(), anyMap(), anyMap()))
                .thenThrow(new BusinessException("AI_SERVICE_UNAVAILABLE", "miao-ai 服务不可用", 503));

        AiEnhanceRequest req = new AiEnhanceRequest();
        req.setText("x");

        BusinessException ex = assertThrows(BusinessException.class, () -> aiEnhanceService.enhance(req));
        assertEquals("AI_SERVICE_UNAVAILABLE", ex.getErrorCode());
    }

    @Test
    @DisplayName("enhance 不传 tone 时不向 agent 发送 tone 字段")
    void enhance_withoutTone_omitsTone() {
        Map<String, Object> output = Map.of("translated", "Hello");
        when(miaoAiClient.invoke(eq("translate-agent"), anyMap(), anyMap()))
                .thenReturn(MiaoAiInvokeResponse.builder().output(output).build());

        AiEnhanceRequest req = new AiEnhanceRequest();
        req.setText("你好");

        AiEnhanceResponse result = aiEnhanceService.enhance(req);
        assertEquals("Hello", result.getTranslated());

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(miaoAiClient).invoke(eq("translate-agent"), captor.capture(), anyMap());
        assert !captor.getValue().containsKey("tone");
    }

    @Test
    @DisplayName("enhance task=context 且带前文时，context 与 task 透传进 input（FR-17）")
    void enhance_contextTask_passesContext() {
        Map<String, Object> output = Map.of("task", "context", "translated", "It works well.");
        when(miaoAiClient.invoke(eq("translate-agent"), anyMap(), anyMap()))
                .thenReturn(MiaoAiInvokeResponse.builder().output(output).build());

        AiEnhanceRequest req = new AiEnhanceRequest();
        req.setText("它运行良好。");
        req.setTargetLang("en");
        req.setTask("context");
        req.setContext("原文：这是一个测试。\n译文：This is a test.");

        AiEnhanceResponse result = aiEnhanceService.enhance(req);
        assertEquals("It works well.", result.getTranslated());
        assertEquals("context", result.getTask());

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(miaoAiClient).invoke(eq("translate-agent"), captor.capture(), anyMap());
        Map<String, Object> sent = captor.getValue();
        assertEquals("context", sent.get("task"));
        assertEquals("原文：这是一个测试。\n译文：This is a test.", sent.get("context"));
    }

    @Test
    @DisplayName("enhance context 为空/空白时不向 agent 发送 context 字段")
    void enhance_blankContext_omitsContext() {
        Map<String, Object> output = Map.of("translated", "Hello");
        when(miaoAiClient.invoke(eq("translate-agent"), anyMap(), anyMap()))
                .thenReturn(MiaoAiInvokeResponse.builder().output(output).build());

        AiEnhanceRequest req = new AiEnhanceRequest();
        req.setText("你好");
        req.setTask("context");
        req.setContext("   ");

        aiEnhanceService.enhance(req);

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(miaoAiClient).invoke(eq("translate-agent"), captor.capture(), anyMap());
        assert !captor.getValue().containsKey("context");
    }
}
