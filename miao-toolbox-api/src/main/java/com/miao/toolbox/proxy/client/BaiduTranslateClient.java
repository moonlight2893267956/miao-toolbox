package com.miao.toolbox.proxy.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.config.BaiduTranslateProperties;
import com.miao.toolbox.observability.AiInvocationRecorder;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;

/**
 * 百度翻译开放平台统一代理客户端。
 *
 * <p>封装通用翻译与语种识别两类 API 的调用、MD5 签名、限流（信号量）、
 * 错误码映射与审计记录。所有密钥仅存于服务端，前端不透出。
 *
 * <p>错误码映射（详见 FR-20）：
 * <ul>
 *   <li>54003 / 58003 → 429 请求频率受限</li>
 *   <li>54004 / 58001 / 58002 / 98001 → 免费额度/余额耗尽（友好提示）</li>
 *   <li>其余 → 502 通用「翻译服务暂不可用」，不透出百度内部码</li>
 * </ul>
 */
@Slf4j
@Service
public class BaiduTranslateClient {

    private final RestTemplate restTemplate;
    private final BaiduTranslateProperties properties;
    private final AiInvocationRecorder recorder;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Semaphore semaphore;

    public BaiduTranslateClient(RestTemplate restTemplate,
                                BaiduTranslateProperties properties,
                                AiInvocationRecorder recorder) {
        this.restTemplate = restTemplate;
        this.properties = properties;
        this.recorder = recorder;
        this.semaphore = new Semaphore(Math.max(1, properties.getMaxConcurrency()));
    }

    /**
     * 文本翻译。
     *
     * @param query 待翻译文本
     * @param from  源语言（百度码，{@code auto} 由百度识别）
     * @param to    目标语言（百度码）
     * @return 翻译结果（实际源语言 + 译文条目）
     */
    public TranslateResult translate(String query, String from, String to) {
        ensureEnabled();
        String salt = BaiduSignUtil.randomSalt();
        String sign = BaiduSignUtil.sign(properties.getAppId(), query, salt, properties.getSecret());

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("q", query);
        body.add("from", from);
        body.add("to", to);
        body.add("appid", properties.getAppId());
        body.add("salt", salt);
        body.add("sign", sign);

        AiInvocationRecorder.InvocationHandle handle = startRecord("baidu-translate", query);
        try {
            String json = doPost(properties.getTranslateUrl(), body);
            TranslateResult result = parseTranslate(parseAndCheck(json), query);
            handle.recordSuccess(null, "translate", null, 0, 0, 0, "chars=" + query.length());
            return result;
        } catch (BusinessException e) {
            handle.recordFailure(e.getErrorCode(), truncate(e.getMessage()));
            throw e;
        } catch (Exception e) {
            handle.recordFailure("TRANSLATE_PARSE_ERROR", truncate(e.getMessage()));
            throw new BusinessException("TRANSLATE_FAILED", "解析翻译结果失败", 502);
        }
    }

    /**
     * 语种识别。
     *
     * <p>百度文本语种识别接口 {@code /api/trans/vip/language} 仅返回最可能的单一语种
     * （{@code data.src}），不含多语种置信度数组，因此 {@code dominant} 即该语种，
     * {@code results} 为单元素且置信度记为 1.0（已识别为该语种）。
     *
     * @param query 待识别文本
     * @return 识别结果（单一语种、主语种）
     */
    public DetectResult detectLanguage(String query) {
        ensureEnabled();
        String salt = BaiduSignUtil.randomSalt();
        String sign = BaiduSignUtil.sign(properties.getAppId(), query, salt, properties.getSecret());

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("q", query);
        body.add("appid", properties.getAppId());
        body.add("salt", salt);
        body.add("sign", sign);

        AiInvocationRecorder.InvocationHandle handle = startRecord("baidu-detect", query);
        try {
            String json = doPost(properties.getDetectUrl(), body);
            DetectResult result = parseDetect(parseAndCheck(json));
            handle.recordSuccess(null, "detect", null, 0, 0, 0, "chars=" + query.length());
            return result;
        } catch (BusinessException e) {
            handle.recordFailure(e.getErrorCode(), truncate(e.getMessage()));
            throw e;
        } catch (Exception e) {
            handle.recordFailure("TRANSLATE_PARSE_ERROR", truncate(e.getMessage()));
            throw new BusinessException("TRANSLATE_FAILED", "解析识别结果失败", 502);
        }
    }

    // ========== 私有方法 ==========

    private void ensureEnabled() {
        if (!properties.isEnabled()) {
            throw new BusinessException("TRANSLATE_DISABLED", "翻译服务未启用", 503);
        }
    }

    /**
     * 当前信号量剩余许可数（用于并发守护的可测试性）。
     */
    int availablePermits() {
        return semaphore.availablePermits();
    }

    private AiInvocationRecorder.InvocationHandle startRecord(String agentName, String summary) {
        return recorder.recordStart(getCurrentUserId(), agentName, summary, getClientIp(), getUserAgent());
    }

    /**
     * 发送表单 POST（通用翻译与语种识别均使用 {@code application/x-www-form-urlencoded}），
     * 受信号量守护；网络异常统一映射为友好错误。
     */
    private String doPost(String url, MultiValueMap<String, String> body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        HttpEntity<MultiValueMap<String, String>> entity = new HttpEntity<>(body, headers);

        try {
            semaphore.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("TRANSLATE_INTERRUPTED", "请求被中断", 503);
        }
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }
            throw new BusinessException("TRANSLATE_FAILED",
                    "百度翻译服务返回异常状态: " + response.getStatusCode(), 502);
        } catch (RestClientException e) {
            log.warn("Baidu translate HTTP error: {}", e.getMessage());
            throw new BusinessException("TRANSLATE_SERVICE_UNAVAILABLE", "翻译服务暂时不可用，请稍后重试", 503);
        } finally {
            semaphore.release();
        }
    }

    /**
     * 解析 JSON 并检查百度业务错误码（error_code 存在且非 0 视为失败）。
     */
    private JsonNode parseAndCheck(String json) {
        JsonNode root;
        try {
            root = objectMapper.readTree(json);
        } catch (Exception e) {
            throw new BusinessException("TRANSLATE_FAILED", "解析百度响应失败", 502);
        }
        JsonNode errorCode = root.get("error_code");
        if (errorCode != null && !"0".equals(errorCode.asText()) && !"".equals(errorCode.asText())) {
            String msg = root.has("error_msg") ? root.get("error_msg").asText() : "未知错误";
            throw mapBaiduError(errorCode.asText(), msg);
        }
        return root;
    }

    private BusinessException mapBaiduError(String code, String msg) {
        return switch (code) {
            case "54003", "58003" ->
                    new BusinessException("TRANSLATE_RATE_LIMITED", "请求过于频繁，请稍后重试", 429);
            case "54004", "58001", "58002", "98001" ->
                    new BusinessException("TRANSLATE_QUOTA_EXHAUSTED", "本月免费额度已用尽，次月自动恢复", 429);
            case "52001" ->
                    new BusinessException("TRANSLATE_TIMEOUT", "翻译请求超时，请稍后重试", 504);
            case "52003", "90107" ->
                    new BusinessException("TRANSLATE_AUTH_FAILED", "翻译服务鉴权失败，请联系管理员", 502);
            default ->
                    new BusinessException("TRANSLATE_FAILED", "翻译服务暂不可用（" + code + "）", 502);
        };
    }

    private TranslateResult parseTranslate(JsonNode root, String query) {
        List<TranslateItem> items = new ArrayList<>();
        JsonNode transResult = root.get("trans_result");
        if (transResult != null && transResult.isArray()) {
            for (JsonNode node : transResult) {
                items.add(new TranslateItem(node.path("src").asText(), node.path("dst").asText()));
            }
        }
        return new TranslateResult(root.path("from").asText(), root.path("to").asText(), items);
    }

    /**
     * 解析语种识别结果。百度接口仅返回最可能的单一语种：{@code data.src}。
     * 无多语种置信度，故 results 为单元素、置信度记为 1.0。
     */
    private DetectResult parseDetect(JsonNode root) {
        JsonNode data = root.get("data");
        String language = (data != null) ? data.path("src").asText() : "";
        if (language == null || language.isBlank()) {
            return new DetectResult(null, null, List.of());
        }
        List<DetectedLanguage> languages = List.of(new DetectedLanguage(language, 1.0));
        return new DetectResult(language, 1.0, languages);
    }

    private String truncate(String text) {
        if (text == null) return null;
        return text.length() > 200 ? text.substring(0, 197) + "..." : text;
    }

    private Long getCurrentUserId() {
        try {
            var auth = org.springframework.security.core.context.SecurityContextHolder
                    .getContext().getAuthentication();
            if (auth != null && auth.getPrincipal() instanceof com.miao.toolbox.auth.entity.User u) {
                return u.getId();
            }
            var attrs = (org.springframework.web.context.request.ServletRequestAttributes)
                    org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                Object userIdAttr = attrs.getRequest().getAttribute("userId");
                if (userIdAttr instanceof Long l) return l;
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private String getClientIp() {
        try {
            var attrs = (org.springframework.web.context.request.ServletRequestAttributes)
                    org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            HttpServletRequest request = attrs.getRequest();
            String ip = request.getHeader("X-Forwarded-For");
            if (ip == null || ip.isBlank()) ip = request.getRemoteAddr();
            else ip = ip.split(",")[0].trim();
            return ip;
        } catch (Exception e) {
            return null;
        }
    }

    private String getUserAgent() {
        try {
            var attrs = (org.springframework.web.context.request.ServletRequestAttributes)
                    org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            String ua = attrs.getRequest().getHeader("User-Agent");
            return ua != null && ua.length() > 255 ? ua.substring(0, 255) : ua;
        } catch (Exception e) {
            return null;
        }
    }

    // ========== 结果类型 ==========

    /** 文本翻译结果 */
    public record TranslateResult(String from, String to, List<TranslateItem> items) {
    }

    /** 单条译文（原文 → 译文） */
    public record TranslateItem(String src, String dst) {
    }

    /** 语种识别结果 */
    public record DetectResult(String language, Double confidence, List<DetectedLanguage> languages) {
    }

    /** 单个识别语种及置信度 */
    public record DetectedLanguage(String language, double confidence) {
    }
}
