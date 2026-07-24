package com.miao.toolbox.network.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.WebhookCustomResponse;
import com.miao.toolbox.network.dto.WebhookHistoryItem;
import com.miao.toolbox.network.dto.WebhookInfo;
import jakarta.servlet.http.HttpServletRequest;
import java.io.ByteArrayInputStream;
import java.time.Duration;
import java.util.Map;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.DelegatingServletInputStream;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * WebhookService 单元测试：mock StringRedisTemplate，覆盖正常与异常路径。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WebhookServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOps;

    @Mock
    private ListOperations<String, String> listOps;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private WebhookService service;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
        when(redisTemplate.opsForList()).thenReturn(listOps);
        service = new WebhookService(redisTemplate, objectMapper);
    }

    private HttpServletRequest mockRequest(String method, String body) throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getMethod()).thenReturn(method);
        when(req.getRequestURI()).thenReturn("/api/network/webhook/test");
        when(req.getRemoteAddr()).thenReturn("1.2.3.4");
        when(req.getHeaderNames()).thenReturn(Collections.enumeration(Collections.emptyList()));
        when(req.getParameterNames()).thenReturn(Collections.enumeration(Collections.emptyList()));
        when(req.getInputStream()).thenReturn(new DelegatingServletInputStream(
                new ByteArrayInputStream(body == null ? new byte[0] : body.getBytes())));
        return req;
    }

    @Test
    void createHook_storesMetaWithTtl() {
        WebhookMeta meta = service.createHook();
        assertNotNull(meta.getHookId());
        assertEquals(24, meta.getHookId().length());
        verify(valueOps).set(eq("webhook:" + meta.getHookId()), anyString(), any(Duration.class));
    }

    @Test
    void receive_existingHook_defaultResponseAndHistoryStored() throws Exception {
        WebhookMeta meta = new WebhookMeta("abc", System.currentTimeMillis(), null);
        when(valueOps.get("webhook:abc")).thenReturn(objectMapper.writeValueAsString(meta));
        HttpServletRequest req = mockRequest("POST", "hello");
        ResponseEntity<String> resp = service.receive("abc", req);

        assertEquals(200, resp.getStatusCode().value());
        assertTrue(resp.getBody().contains("\"received\":true"));
        verify(listOps).rightPush(eq("webhook:req:abc"), anyString());
        verify(listOps).trim(eq("webhook:req:abc"), eq(-50L), eq(-1L));
        verify(redisTemplate).expire(eq("webhook:req:abc"), any(Duration.class));
    }

    @Test
    void receive_customResponse_returnsConfigured() throws Exception {
        WebhookCustomResponse cr = WebhookCustomResponse.builder().statusCode(201).body("{\"ok\":1}").build();
        WebhookMeta meta = new WebhookMeta("abc", System.currentTimeMillis(), cr);
        when(valueOps.get("webhook:abc")).thenReturn(objectMapper.writeValueAsString(meta));
        HttpServletRequest req = mockRequest("POST", "x");
        ResponseEntity<String> resp = service.receive("abc", req);

        assertEquals(201, resp.getStatusCode().value());
        assertEquals("{\"ok\":1}", resp.getBody());
    }

    @Test
    void receive_customResponse_appliesHeaders() throws Exception {
        WebhookCustomResponse cr = WebhookCustomResponse.builder()
                .statusCode(201)
                .body("{\"ok\":1}")
                .headers(Map.of("X-Request-Id", "abc", "X-Rate-Limit", "100"))
                .build();
        WebhookMeta meta = new WebhookMeta("abc", System.currentTimeMillis(), cr);
        when(valueOps.get("webhook:abc")).thenReturn(objectMapper.writeValueAsString(meta));
        HttpServletRequest req = mockRequest("POST", "x");
        ResponseEntity<String> resp = service.receive("abc", req);

        assertEquals(201, resp.getStatusCode().value());
        assertEquals("{\"ok\":1}", resp.getBody());
        assertEquals("abc", resp.getHeaders().getFirst("X-Request-Id"));
        assertEquals("100", resp.getHeaders().getFirst("X-Rate-Limit"));
    }

    @Test
    void saveCustomResponse_rejectsInvalidHeaderName() throws Exception {
        WebhookMeta meta = new WebhookMeta("abc", 1000L, null);
        when(valueOps.get("webhook:abc")).thenReturn(objectMapper.writeValueAsString(meta));
        WebhookCustomResponse bad = WebhookCustomResponse.builder()
                .statusCode(200)
                .body("x")
                .headers(Map.of("Bad:Name", "v"))
                .build();
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.saveCustomResponse("abc", bad));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    void receive_defaultResponse_recordsStatusAndBody() throws Exception {
        WebhookMeta meta = new WebhookMeta("abc", System.currentTimeMillis(), null);
        when(valueOps.get("webhook:abc")).thenReturn(objectMapper.writeValueAsString(meta));
        HttpServletRequest req = mockRequest("POST", "x");
        ResponseEntity<String> resp = service.receive("abc", req);

        assertEquals(200, resp.getStatusCode().value());
        assertTrue(resp.getBody().contains("\"received\":true"));
        assertTrue(resp.getBody().contains("\"hookId\":\"abc\""));
    }

    @Test
    void receive_nonExistingHook_throwsNotFound() {
        when(valueOps.get("webhook:missing")).thenReturn(null);
        HttpServletRequest req = mock(HttpServletRequest.class);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.receive("missing", req));
        assertEquals(404, ex.getHttpStatus());
    }

    @Test
    void getHistory_returnsReversedRecentFirst() throws Exception {
        WebhookMeta meta = new WebhookMeta("abc", System.currentTimeMillis(), null);
        when(valueOps.get("webhook:abc")).thenReturn(objectMapper.writeValueAsString(meta));
        WebhookHistoryItem i1 = WebhookHistoryItem.builder().id("1").receivedAt(100).build();
        WebhookHistoryItem i2 = WebhookHistoryItem.builder().id("2").receivedAt(200).build();
        when(listOps.range(eq("webhook:req:abc"), anyLong(), anyLong()))
                .thenReturn(List.of(objectMapper.writeValueAsString(i1), objectMapper.writeValueAsString(i2)));

        List<WebhookHistoryItem> list = service.getHistory("abc");
        assertEquals(2, list.size());
        assertEquals("2", list.get(0).getId());
        assertEquals("1", list.get(1).getId());
    }

    @Test
    void getInfo_returnsCountAndExpiry() throws Exception {
        WebhookMeta meta = new WebhookMeta("abc", 1000L, null);
        when(valueOps.get("webhook:abc")).thenReturn(objectMapper.writeValueAsString(meta));
        when(listOps.size("webhook:req:abc")).thenReturn(5L);

        WebhookInfo info = service.getInfo("abc");
        assertEquals("abc", info.getHookId());
        assertEquals(5, info.getRequestCount());
        assertEquals(1000L + Duration.ofHours(24).toMillis(), info.getExpiresAt());
    }

    @Test
    void saveCustomResponse_updatesMetaAndPreservesTtl() throws Exception {
        WebhookMeta meta = new WebhookMeta("abc", 1000L, null);
        when(valueOps.get("webhook:abc")).thenReturn(objectMapper.writeValueAsString(meta));
        when(redisTemplate.getExpire(eq("webhook:abc"), any())).thenReturn(1000L);

        service.saveCustomResponse("abc", WebhookCustomResponse.builder().statusCode(404).body("nf").build());

        verify(valueOps).set(eq("webhook:abc"), contains("\"statusCode\":404"));
        verify(redisTemplate).expire(eq("webhook:abc"), eq(1000L), any(TimeUnit.class));
    }

    @Test
    void deleteHook_removesKeys() {
        service.deleteHook("abc");
        verify(redisTemplate).delete("webhook:abc");
        verify(redisTemplate).delete("webhook:req:abc");
    }

    @Test
    void subscribe_registersEmitter() throws Exception {
        WebhookMeta meta = new WebhookMeta("abc", 1000L, null);
        when(valueOps.get("webhook:abc")).thenReturn(objectMapper.writeValueAsString(meta));
        SseEmitter em = service.subscribe("abc");
        assertNotNull(em);
    }
}
