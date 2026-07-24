package com.miao.toolbox.network.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.WebhookCustomResponse;
import com.miao.toolbox.network.dto.WebhookHistoryItem;
import com.miao.toolbox.network.dto.WebhookInfo;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Webhook 测试接收器核心服务。
 *
 * <p>设计要点：
 * <ul>
 *   <li>端点元数据存 Redis（key {@code webhook:{hookId}}），TTL 24h，到期即失效。</li>
 *   <li>请求历史存 Redis List（key {@code webhook:req:{hookId}}），保留最近 {@value #MAX_HISTORY} 条，同样 TTL。</li>
 *   <li>实时推送走内存 {@code Map<hookId, SseEmitter>}（单实例部署，与 TcpPing SSE 同理）。</li>
 *   <li>接收端点为公开接口（无登录态、无项目签名），依赖随机 hookId 作为凭证。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookService {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    private static final Duration HOOK_TTL = Duration.ofHours(24);
    private static final int MAX_HISTORY = 50;
    private static final long MAX_BODY_BYTES = 1024L * 1024L; // 1MB
    private static final String HOOK_KEY = "webhook:%s";
    private static final String REQ_KEY = "webhook:req:%s";

    /** hookId -> 该端点的 SSE 订阅者列表（内存，单实例）。 */
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> subscribers = new ConcurrentHashMap<>();

    /** 创建临时端点，返回元数据（含 hookId 与创建时间）。 */
    public WebhookMeta createHook() {
        String hookId = generateHookId();
        WebhookMeta meta = new WebhookMeta(hookId, System.currentTimeMillis(), null);
        try {
            redisTemplate.opsForValue().set(hookKey(hookId), objectMapper.writeValueAsString(meta), HOOK_TTL);
        } catch (JsonProcessingException e) {
            throw new BusinessException("WEBHOOK_CREATE_FAILED", "创建端点失败", 500);
        }
        return meta;
    }

    /**
     * 接收第三方 POST 请求：记录历史、推送 SSE、并按配置返回响应。
     *
     * @throws BusinessException 端点不存在或已过期时返回 404
     */
    public ResponseEntity<String> receive(String hookId, HttpServletRequest request) {
        WebhookMeta meta = readMeta(hookId);
        WebhookHistoryItem item = buildItem(request);

        // 计算端点本次实际返回给第三方的响应（自定义或默认）
        ResponseEntity<String> response = buildResponse(hookId, meta, item);

        // 记录本次实际响应，便于前端在结果项查看
        item.setResponseStatusCode(response.getStatusCode().value());
        Map<String, String> respHeaders = new LinkedHashMap<>();
        response.getHeaders().forEach((k, vals) -> {
            if (!vals.isEmpty()) {
                respHeaders.put(k, vals.get(0));
            }
        });
        item.setResponseHeaders(respHeaders);
        item.setResponseBody(response.getBody());

        try {
            String json = objectMapper.writeValueAsString(item);
            redisTemplate.opsForList().rightPush(reqKey(hookId), json);
            redisTemplate.opsForList().trim(reqKey(hookId), -MAX_HISTORY, -1);
            redisTemplate.expire(reqKey(hookId), HOOK_TTL);
        } catch (JsonProcessingException e) {
            log.warn("webhook persist history failed: {}", e.getMessage());
        }

        pushToSubscribers(hookId, item);

        return response;
    }

    /** 根据自定义响应配置构造端点返回（自定义响应或默认 JSON）。 */
    private ResponseEntity<String> buildResponse(String hookId, WebhookMeta meta, WebhookHistoryItem item) {
        WebhookCustomResponse cr = meta.getCustomResponse();
        if (cr != null && cr.getStatusCode() > 0) {
            // 自定义响应：应用响应头（Content-Type/Content-Length 由系统控制，忽略）
            ResponseEntity.BodyBuilder builder = ResponseEntity.status(cr.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON);
            Map<String, String> headers = cr.getHeaders();
            if (headers != null) {
                headers.forEach((name, value) -> {
                    if (isValidHeaderName(name)) {
                        builder.header(name, value == null ? "" : value);
                    }
                });
            }
            return builder.body(cr.getBody() == null ? "" : cr.getBody());
        }
        String defaultBody = "{\"received\":true,\"hookId\":\"" + hookId
                + "\",\"receivedAt\":" + item.getReceivedAt() + "}";
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(defaultBody);
    }

    /** 读取最近请求历史（最新在前）。 */
    public List<WebhookHistoryItem> getHistory(String hookId) {
        readMeta(hookId);
        List<String> raw = redisTemplate.opsForList().range(reqKey(hookId), 0, -1);
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        List<WebhookHistoryItem> items = new ArrayList<>(raw.size());
        for (String s : raw) {
            try {
                items.add(objectMapper.readValue(s, WebhookHistoryItem.class));
            } catch (JsonProcessingException e) {
                log.warn("webhook history parse failed: {}", e.getMessage());
            }
        }
        Collections.reverse(items);
        return items;
    }

    /** 读取端点元信息（含已接收数量与自定义响应）。 */
    public WebhookInfo getInfo(String hookId) {
        WebhookMeta meta = readMeta(hookId);
        Long size = redisTemplate.opsForList().size(reqKey(hookId));
        long count = size == null ? 0 : size;
        return WebhookInfo.builder()
                .hookId(hookId)
                .createdAt(meta.getCreatedAt())
                .expiresAt(meta.getCreatedAt() + HOOK_TTL.toMillis())
                .requestCount(count)
                .customResponse(meta.getCustomResponse())
                .build();
    }

    /** 保存/清除自定义响应。statusCode<=0 视为清除（恢复默认响应）。 */
    public void saveCustomResponse(String hookId, WebhookCustomResponse resp) {
        WebhookMeta meta = readMeta(hookId);
        if (resp.getStatusCode() > 0 && (resp.getStatusCode() < 100 || resp.getStatusCode() > 599)) {
            throw new BusinessException("INVALID_STATUS_CODE", "状态码必须在 100-599 之间", 400);
        }
        if (resp.getHeaders() != null) {
            for (String name : resp.getHeaders().keySet()) {
                if (!isValidHeaderName(name)) {
                    throw new BusinessException("INVALID_HEADER_NAME",
                            "非法的响应头名称：" + name, 400);
                }
            }
        }
        meta.setCustomResponse(resp.getStatusCode() > 0 ? resp : null);
        Long ttl = redisTemplate.getExpire(hookKey(hookId), java.util.concurrent.TimeUnit.MILLISECONDS);
        try {
            redisTemplate.opsForValue().set(hookKey(hookId), objectMapper.writeValueAsString(meta));
            if (ttl != null && ttl > 0) {
                redisTemplate.expire(hookKey(hookId), ttl, java.util.concurrent.TimeUnit.MILLISECONDS);
            }
        } catch (JsonProcessingException e) {
            throw new BusinessException("WEBHOOK_SAVE_FAILED", "保存自定义响应失败", 500);
        }
    }

    /** 删除端点及其历史，并关闭该端点的所有 SSE 连接。 */
    public void deleteHook(String hookId) {
        redisTemplate.delete(hookKey(hookId));
        redisTemplate.delete(reqKey(hookId));
        CopyOnWriteArrayList<SseEmitter> list = subscribers.remove(hookId);
        if (list != null) {
            for (SseEmitter em : list) {
                try {
                    em.complete();
                } catch (Throwable ignored) {
                    // 客户端可能已断开
                }
            }
        }
    }

    /**
     * 注册 SSE 订阅（30 分钟超时）。调用方需已校验端点存在。
     */
    public SseEmitter subscribe(String hookId) {
        readMeta(hookId);
        SseEmitter emitter = new SseEmitter(30L * 60L * 1000L);
        CopyOnWriteArrayList<SseEmitter> list = subscribers.computeIfAbsent(hookId, k -> new CopyOnWriteArrayList<>());
        list.add(emitter);
        emitter.onCompletion(() -> removeEmitter(hookId, emitter));
        emitter.onTimeout(() -> removeEmitter(hookId, emitter));
        emitter.onError(e -> removeEmitter(hookId, emitter));
        return emitter;
    }

    // ===================== 辅助方法 =====================

    private WebhookMeta readMeta(String hookId) {
        String json = redisTemplate.opsForValue().get(hookKey(hookId));
        if (json == null) {
            throw new BusinessException("WEBHOOK_NOT_FOUND", "端点不存在或已过期", 404);
        }
        try {
            return objectMapper.readValue(json, WebhookMeta.class);
        } catch (JsonProcessingException e) {
            throw new BusinessException("WEBHOOK_CORRUPTED", "端点数据损坏", 500);
        }
    }

    private WebhookHistoryItem buildItem(HttpServletRequest request) {
        String body = readBody(request);
        Map<String, String> headers = new LinkedHashMap<>();
        Enumeration<String> hn = request.getHeaderNames();
        while (hn != null && hn.hasMoreElements()) {
            String name = hn.nextElement();
            headers.put(name, request.getHeader(name));
        }
        Map<String, String> query = new LinkedHashMap<>();
        Enumeration<String> qn = request.getParameterNames();
        while (qn != null && qn.hasMoreElements()) {
            String name = qn.nextElement();
            String[] vals = request.getParameterValues(name);
            query.put(name, (vals != null && vals.length > 0) ? vals[0] : "");
        }
        return WebhookHistoryItem.builder()
                .id(UUID.randomUUID().toString())
                .receivedAt(System.currentTimeMillis())
                .method(request.getMethod())
                .sourceIp(getClientIp(request))
                .path(request.getRequestURI())
                .queryParams(query)
                .headers(headers)
                .body(body)
                .sizeBytes(body == null ? 0 : body.getBytes(StandardCharsets.UTF_8).length)
                .build();
    }

    private void pushToSubscribers(String hookId, WebhookHistoryItem item) {
        CopyOnWriteArrayList<SseEmitter> list = subscribers.get(hookId);
        if (list == null || list.isEmpty()) {
            return;
        }
        String data;
        try {
            data = objectMapper.writeValueAsString(item);
        } catch (JsonProcessingException e) {
            return;
        }
        for (SseEmitter em : list) {
            try {
                em.send(SseEmitter.event().name("request").data(data));
            } catch (Exception e) {
                removeEmitter(hookId, em);
            }
        }
    }

    private void removeEmitter(String hookId, SseEmitter em) {
        CopyOnWriteArrayList<SseEmitter> list = subscribers.get(hookId);
        if (list != null) {
            list.remove(em);
        }
    }

    private String readBody(HttpServletRequest request) {
        try {
            InputStream in = request.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int total = 0;
            int n;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > MAX_BODY_BYTES) {
                    throw new BusinessException("WEBHOOK_BODY_TOO_LARGE", "请求体超过 1MB 上限", 413);
                }
                bos.write(buf, 0, n);
            }
            return bos.toString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new BusinessException("WEBHOOK_BODY_READ_FAILED", "读取请求体失败", 400);
        }
    }

    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    /** 生成 24 位十六进制（96 bit 随机）hookId，不可猜测。 */
    private String generateHookId() {
        SecureRandom random = new SecureRandom();
        byte[] bytes = new byte[12];
        random.nextBytes(bytes);
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private String hookKey(String hookId) {
        return String.format(HOOK_KEY, hookId);
    }

    /** 校验响应头名称：非空、仅含 token 字符（不含冒号/换行/空格等控制字符）。 */
    private boolean isValidHeaderName(String name) {
        if (name == null || name.isEmpty()) {
            return false;
        }
        if ("content-type".equalsIgnoreCase(name) || "content-length".equalsIgnoreCase(name)) {
            return false;
        }
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (c <= 0x20 || c == 0x7f || c == ':' || c == ',') {
                return false;
            }
        }
        return true;
    }

    private String reqKey(String hookId) {
        return String.format(REQ_KEY, hookId);
    }
}
