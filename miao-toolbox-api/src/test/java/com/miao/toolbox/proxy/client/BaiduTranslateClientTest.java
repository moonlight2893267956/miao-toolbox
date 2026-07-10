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
    private static final String IMAGE_URL = "https://image";

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
        properties.setImageUrl(IMAGE_URL);
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

    @Test
    @DisplayName("imageTranslate 成功解析 content/sumSrc/sumDst/pasteImg 并补全 data URL")
    void imageTranslate_success() {
        String body = "{\"error_code\":\"0\",\"data\":{"
                + "\"from\":\"zh\",\"to\":\"en\","
                + "\"content\":[{\"src\":\"你好\",\"dst\":\"Hello\",\"rect\":\"79 23 246 43\","
                + "\"points\":[{\"x\":254,\"y\":280},{\"x\":506,\"y\":278}]}],"
                + "\"sumSrc\":\"你好\",\"sumDst\":\"Hello\",\"pasteImg\":\"BASE64AAAA\"}}";
        when(restTemplate.postForEntity(eq(IMAGE_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok(body));

        BaiduTranslateClient.ImageTranslateResult result = client.imageTranslate("img".getBytes(), "auto", "en");

        assertEquals("zh", result.from());
        assertEquals("en", result.to());
        assertEquals(1, result.blocks().size());
        assertEquals("你好", result.blocks().get(0).src());
        assertEquals("Hello", result.blocks().get(0).dst());
        assertEquals("79 23 246 43", result.blocks().get(0).rect());
        assertEquals(254, result.blocks().get(0).points().get(0).x());
        assertEquals(280, result.blocks().get(0).points().get(0).y());
        assertEquals("你好", result.sumSrc());
        assertEquals("Hello", result.sumDst());
        assertEquals("data:image/png;base64,BASE64AAAA", result.pasteImg());
        verify(handle).recordSuccess(isNull(), eq("image-translate"), isNull(), eq(0), eq(0), eq(0), any());
    }

    @Test
    @DisplayName("imageTranslate 兼容 content 位于根节点（非 data 内）")
    void imageTranslate_contentAtRoot() {
        String body = "{\"error_code\":\"0\",\"from\":\"en\",\"to\":\"zh\","
                + "\"content\":[{\"src\":\"a\",\"dst\":\"b\"}],"
                + "\"sumSrc\":\"a\",\"sumDst\":\"b\",\"pasteImg\":\"IMG\"}";
        when(restTemplate.postForEntity(eq(IMAGE_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok(body));

        BaiduTranslateClient.ImageTranslateResult result = client.imageTranslate("img".getBytes(), "auto", "zh");

        assertEquals(1, result.blocks().size());
        assertEquals("a", result.blocks().get(0).src());
        assertEquals("data:image/png;base64,IMG", result.pasteImg());
    }

    @Test
    @DisplayName("imageTranslate 实际计算并携带正确图片签名")
    void imageTranslate_computesSignature() {
        String img = "fake-image-bytes";
        byte[] imgBytes = img.getBytes();
        String imgMd5 = BaiduSignUtil.md5Hex(imgBytes);
        when(restTemplate.postForEntity(eq(IMAGE_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok("{\"error_code\":\"0\",\"data\":{\"content\":[]}}"));

        client.imageTranslate(imgBytes, "auto", "en");

        ArgumentCaptor<HttpEntity<?>> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForEntity(eq(IMAGE_URL), captor.capture(), eq(String.class));

        @SuppressWarnings("unchecked")
        MultiValueMap<String, Object> map = (MultiValueMap<String, Object>) captor.getValue().getBody();
        String salt = (String) map.getFirst("salt");
        String sign = (String) map.getFirst("sign");
        assertEquals("app1", map.getFirst("appid"));
        assertEquals("3", map.getFirst("version"));
        assertEquals(BaiduSignUtil.signImage("app1", imgMd5, salt,
                BaiduTranslateClient.CUID, BaiduTranslateClient.MAC, "sec1"), sign);
    }

    @Test
    @DisplayName("imageTranslate 百度额度耗尽错误码映射为友好提示")
    void imageTranslate_quotaExhausted() {
        String body = "{\"error_code\":\"54004\",\"error_msg\":\"balance\"}";
        when(restTemplate.postForEntity(eq(IMAGE_URL), any(), eq(String.class)))
                .thenReturn(ResponseEntity.ok(body));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> client.imageTranslate("img".getBytes(), "auto", "zh"));
        assertEquals("TRANSLATE_QUOTA_EXHAUSTED", ex.getErrorCode());
        assertEquals(429, ex.getHttpStatus());
    }

    @Test
    @DisplayName("imageTranslate 未启用时返回 503，且不发起 HTTP 请求")
    void imageTranslate_disabled_throwsWithoutCall() {
        properties.setEnabled(false);
        BaiduTranslateClient disabled = new BaiduTranslateClient(restTemplate, properties, recorder);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> disabled.imageTranslate("img".getBytes(), "auto", "zh"));
        assertEquals("TRANSLATE_DISABLED", ex.getErrorCode());
        assertEquals(503, ex.getHttpStatus());
        verifyNoInteractions(restTemplate);
    }
}
