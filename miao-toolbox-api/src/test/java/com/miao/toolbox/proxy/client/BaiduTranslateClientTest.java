package com.miao.toolbox.proxy.client;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.config.BaiduTranslateProperties;
import com.miao.toolbox.observability.AiInvocationRecorder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("BaiduTranslateClient 代理客户端测试")
class BaiduTranslateClientTest {

    private static final String TRANSLATE_URL = "https://translate";
    private static final String DETECT_URL = "https://detect";

    @Mock
    private RestTemplate restTemplate;
    @Mock
    private AiInvocationRecorder recorder;
    @Mock
    private AiInvocationRecorder.InvocationHandle handle;

    private BaiduTranslateProperties properties;
    private BaiduTranslateClient client;

    @BeforeEach
    void setUp() {
        properties = new BaiduTranslateProperties();
        properties.setEnabled(true);
        properties.setAppId("app1");
        properties.setSecret("sec1");
        properties.setTranslateUrl(TRANSLATE_URL);
        properties.setDetectUrl(DETECT_URL);
        properties.setMaxConcurrency(10);

        lenient().when(recorder.recordStart(any(), any(), any(), any(), any())).thenReturn(handle);
        client = new BaiduTranslateClient(restTemplate, properties, recorder);
    }

    @Test
    @DisplayName("translate 成功解析 trans_result")
    void translate_success() {
        String body = "{\"from\":\"en\",\"to\":\"zh\",\"trans_result\":[{\"src\":\"hello\",\"dst\":\"你好\"}]}";
        when(restTemplate.postForEntity(eq(TRANSLATE_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok(body));

        BaiduTranslateClient.TranslateResult result = client.translate("hello", "auto", "zh");

        assertEquals("en", result.from());
        assertEquals("zh", result.to());
        assertEquals(1, result.items().size());
        assertEquals("你好", result.items().get(0).dst());
        verify(handle).recordSuccess(isNull(), eq("translate"), isNull(), eq(0), eq(0), eq(0), any());
    }

    @Test
    @DisplayName("translate 实际计算并携带正确签名")
    void translate_computesSignature() {
        String body = "{\"from\":\"en\",\"to\":\"zh\",\"trans_result\":[{\"src\":\"hello\",\"dst\":\"你好\"}]}";
        when(restTemplate.postForEntity(eq(TRANSLATE_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok(body));

        client.translate("hello", "auto", "zh");

        ArgumentCaptor<HttpEntity<?>> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForEntity(eq(TRANSLATE_URL), captor.capture(), eq(String.class));

        @SuppressWarnings("unchecked")
        MultiValueMap<String, String> map = (MultiValueMap<String, String>) captor.getValue().getBody();
        String salt = map.getFirst("salt");
        String sign = map.getFirst("sign");
        assertEquals("app1", map.getFirst("appid"));
        assertEquals("hello", map.getFirst("q"));
        assertEquals(BaiduSignUtil.sign("app1", "hello", salt, "sec1"), sign);
    }

    @Test
    @DisplayName("detect 成功解析单一语种 data.src")
    void detect_success() {
        String body = "{\"error_code\":\"0\",\"data\":{\"src\":\"en\"}}";
        when(restTemplate.postForEntity(eq(DETECT_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok(body));

        BaiduTranslateClient.DetectResult result = client.detectLanguage("hello");

        assertEquals("en", result.language());
        assertEquals(1.0, result.confidence(), 0.001);
        assertEquals(1, result.languages().size());
        assertEquals("en", result.languages().get(0).language());
        verify(handle).recordSuccess(isNull(), eq("detect"), isNull(), eq(0), eq(0), eq(0), any());
    }

    @Test
    @DisplayName("detect data 缺失 src → 返回空结果")
    void detect_noSource() {
        String body = "{\"data\":{}}";
        when(restTemplate.postForEntity(eq(DETECT_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok(body));

        BaiduTranslateClient.DetectResult result = client.detectLanguage("你好");

        assertNull(result.language());
        assertTrue(result.languages().isEmpty());
    }

    @Test
    @DisplayName("百度错误码 54003 映射为 429 频率受限")
    void translate_rateLimited() {
        String body = "{\"error_code\":\"54003\",\"error_msg\":\"limit\"}";
        when(restTemplate.postForEntity(eq(TRANSLATE_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok(body));

        BusinessException ex = assertThrows(BusinessException.class, () -> client.translate("hi", "auto", "zh"));
        assertEquals("TRANSLATE_RATE_LIMITED", ex.getErrorCode());
        assertEquals(429, ex.getHttpStatus());
        verify(handle).recordFailure(eq("TRANSLATE_RATE_LIMITED"), any());
    }

    @Test
    @DisplayName("百度额度耗尽错误码映射为友好提示")
    void translate_quotaExhausted() {
        String body = "{\"error_code\":\"54004\",\"error_msg\":\"balance\"}";
        when(restTemplate.postForEntity(eq(TRANSLATE_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok(body));

        BusinessException ex = assertThrows(BusinessException.class, () -> client.translate("hi", "auto", "zh"));
        assertEquals("TRANSLATE_QUOTA_EXHAUSTED", ex.getErrorCode());
        assertEquals(429, ex.getHttpStatus());
    }

    @Test
    @DisplayName("HTTP 网络异常映射为服务不可用")
    void translate_networkError() {
        when(restTemplate.postForEntity(eq(TRANSLATE_URL), any(), eq(String.class)))
                .thenThrow(new RestClientException("boom"));

        BusinessException ex = assertThrows(BusinessException.class, () -> client.translate("hi", "auto", "zh"));
        assertEquals("TRANSLATE_SERVICE_UNAVAILABLE", ex.getErrorCode());
        assertEquals(503, ex.getHttpStatus());
    }

    @Test
    @DisplayName("detect HTTP 网络异常映射为服务不可用")
    void detect_networkError() {
        when(restTemplate.postForEntity(eq(DETECT_URL), any(), eq(String.class)))
                .thenThrow(new RestClientException("boom"));

        BusinessException ex = assertThrows(BusinessException.class, () -> client.detectLanguage("hi"));
        assertEquals("TRANSLATE_SERVICE_UNAVAILABLE", ex.getErrorCode());
        assertEquals(503, ex.getHttpStatus());
    }

    @Test
    @DisplayName("未启用时返回 503，且不发起 HTTP 请求")
    void disabled_throwsWithoutCall() {
        properties.setEnabled(false);
        client = new BaiduTranslateClient(restTemplate, properties, recorder);

        BusinessException ex = assertThrows(BusinessException.class, () -> client.translate("hi", "auto", "zh"));
        assertEquals("TRANSLATE_DISABLED", ex.getErrorCode());
        assertEquals(503, ex.getHttpStatus());
        verifyNoInteractions(restTemplate);
    }

    @Test
    @DisplayName("信号量约束：并发数不超过 maxConcurrency")
    void semaphore_limitsConcurrency() throws InterruptedException {
        properties.setMaxConcurrency(2);
        BaiduTranslateClient limited = new BaiduTranslateClient(restTemplate, properties, recorder);
        assertEquals(2, limited.availablePermits());
    }
}
