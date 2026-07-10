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
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

    /** 图片翻译调用方标识（服务端代理固定值，仅用于百度签名/请求） */
    static final String CUID = "miao-toolbox";
    /** 图片翻译设备 MAC 标识（服务端代理固定值） */
    static final String MAC = "00:00:00:00:00:00";

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

    /**
     * 图片翻译（OCR + 逐块译文）。
     *
     * <p>调用百度图片翻译 API（开放平台，{@code /api/trans/sdk/picture}），以
     * {@code multipart/form-data} 上传图片，签名规则与文本翻译不同：
     * {@code MD5(appid + MD5(imageBytes) + salt + cuid + mac + secret)}。
     *
     * @param image 图片原始字节（jpg/png）
     * @param from  源语言（百度码，{@code auto} 由百度识别）
     * @param to    目标语言（百度码）
     * @return 图片翻译结果（源/目标语言 + 文本块 + 整图全文 + 译文渲染图）
     */
    public ImageTranslateResult imageTranslate(byte[] image, String from, String to) {
        ensureEnabled();
        String salt = BaiduSignUtil.randomSalt();
        String imageMd5 = BaiduSignUtil.md5Hex(image);
        String sign = BaiduSignUtil.signImage(properties.getAppId(), imageMd5, salt, CUID, MAC, properties.getSecret());

        ByteArrayResource imageResource = new ByteArrayResource(image) {
            @Override
            public String getFilename() {
                return "image.png";
            }
        };
        HttpHeaders imageHeaders = new HttpHeaders();
        imageHeaders.setContentType(MediaType.IMAGE_PNG);
        HttpEntity<ByteArrayResource> imagePart = new HttpEntity<>(imageResource, imageHeaders);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("image", imagePart);
        body.add("from", from);
        body.add("to", to);
        body.add("appid", properties.getAppId());
        body.add("salt", salt);
        body.add("cuid", CUID);
        body.add("mac", MAC);
        body.add("version", "3");
        // 高级版：请求百度返回译文渲染图（整图贴合）。paste=1 整图贴合 / 2 块区贴合
        body.add("paste", "1");
        body.add("sign", sign);

        AiInvocationRecorder.InvocationHandle handle =
                startRecord("baidu-image", "<image " + image.length + " bytes>");
        try {
            String json = doPostMultipart(properties.getImageUrl(), body);
            ImageTranslateResult result = parseImageTranslate(parseAndCheck(json));
            handle.recordSuccess(null, "image-translate", null, 0, 0, 0, "blocks=" + result.blocks().size());
            return result;
        } catch (BusinessException e) {
            handle.recordFailure(e.getErrorCode(), truncate(e.getMessage()));
            throw e;
        } catch (Exception e) {
            handle.recordFailure("TRANSLATE_PARSE_ERROR", truncate(e.getMessage()));
            throw new BusinessException("TRANSLATE_FAILED", "解析图片翻译结果失败", 502);
        }
    }

    /**
     * 语音翻译（录音识别 + 翻译）。
     *
     * <p>调用百度语音翻译 v2 API（{@code /api/trans/v2/voicetrans}），与通用/图片翻译的
     * MD5 签名不同，本接口使用 {@code HMAC-SHA256}：以 {@code secretKey} 为密钥，
     * 对 {@code appId + timestamp + voiceBase64} 签名，置于请求头 {@code X-Sign}。
     *
     * @param audio  录音音频原始字节（pcm/wav/amr/m4a）
     * @param format 音频格式（百度码：pcm/wav/amr/m4a）
     * @param from   源语言（百度码，{@code auto} 由百度识别）
     * @param to     目标语言（百度码）
     * @return 语音翻译结果（识别原文 + 译文）
     */
    public SpeechTranslateResult speechTranslate(byte[] audio, String format, String from, String to) {
        ensureEnabled();
        String voiceBase64 = Base64.getEncoder().encodeToString(audio);
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
        String sign = BaiduSignUtil.signVoice(
                properties.getAppId(), resolveVoiceSecretKey(), timestamp, voiceBase64);

        Map<String, String> headers = new HashMap<>();
        headers.put("X-Appid", properties.getAppId());
        headers.put("X-Timestamp", timestamp);
        headers.put("X-Sign", sign);

        String body = buildVoiceBody(from, to, format, voiceBase64);

        AiInvocationRecorder.InvocationHandle handle =
                startRecord("baidu-voice", "<audio " + audio.length + " bytes, format=" + format + ">");
        try {
            String json = doPostJson(properties.getVoiceUrl(), headers, body);
            SpeechTranslateResult result = parseSpeechTranslate(json);
            handle.recordSuccess(null, "voice-translate", null, 0, 0, 0, "sourceLen=" + result.source().length());
            return result;
        } catch (BusinessException e) {
            handle.recordFailure(e.getErrorCode(), truncate(e.getMessage()));
            throw e;
        } catch (Exception e) {
            handle.recordFailure("TRANSLATE_PARSE_ERROR", truncate(e.getMessage()));
            throw new BusinessException("TRANSLATE_FAILED", "解析语音翻译结果失败", 502);
        }
    }

    // ========== 私有方法 ==========

    /**
     * 解析语音翻译 HMAC 密钥。
     *
     * <p>百度多数账号语音翻译与通用翻译共用同一 {@code secret}，因此当 {@code secretKey}
     * 未配置（为空/空白），或误留了未被 Spring 解析的 {@code ${...}} 占位符字面量时，
     * 自动回退复用 {@code secret}，避免因配置遗漏导致签名鉴权失败（TRANSLATE_AUTH_FAILED）。
     */
    private String resolveVoiceSecretKey() {
        String sk = properties.getSecretKey();
        if (sk == null || sk.isBlank() || sk.startsWith("${")) {
            return properties.getSecret();
        }
        return sk;
    }

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

    /**
     * 发送 multipart/form-data POST（图片翻译专用），受信号量守护；
     * 网络异常统一映射为友好错误。
     */
    private String doPostMultipart(String url, MultiValueMap<String, Object> body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);

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
                    "百度图片翻译返回异常状态: " + response.getStatusCode(), 502);
        } catch (RestClientException e) {
            log.warn("Baidu image translate HTTP error: {}", e.getMessage());
            throw new BusinessException("TRANSLATE_SERVICE_UNAVAILABLE", "翻译服务暂时不可用，请稍后重试", 503);
        } finally {
            semaphore.release();
        }
    }

    /**
     * 发送 JSON POST（语音翻译专用，携带自定义鉴权头 {@code X-Appid/X-Timestamp/X-Sign}），
     * 受信号量守护；网络异常统一映射为友好错误。
     */
    private String doPostJson(String url, Map<String, String> headers, String jsonBody) {
        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setContentType(MediaType.APPLICATION_JSON);
        if (headers != null) {
            headers.forEach(httpHeaders::set);
        }
        HttpEntity<String> entity = new HttpEntity<>(jsonBody, httpHeaders);

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
                    "百度语音翻译返回异常状态: " + response.getStatusCode(), 502);
        } catch (RestClientException e) {
            log.warn("Baidu voice translate HTTP error: {}", e.getMessage());
            throw new BusinessException("TRANSLATE_SERVICE_UNAVAILABLE", "翻译服务暂时不可用，请稍后重试", 503);
        } finally {
            semaphore.release();
        }
    }

    /** 构造语音翻译 JSON 请求体（from/to/format/voice） */
    private String buildVoiceBody(String from, String to, String format, String voiceBase64) {
        try {
            Map<String, String> m = new HashMap<>();
            m.put("from", from);
            m.put("to", to);
            m.put("format", format);
            m.put("voice", voiceBase64);
            return objectMapper.writeValueAsString(m);
        } catch (Exception e) {
            throw new BusinessException("TRANSLATE_FAILED", "构建语音翻译请求失败", 502);
        }
    }

    /**
     * 解析语音翻译结果。百度 v2 接口以 {@code code=0} 表示成功，
     * 业务数据位于 {@code data.source}/{@code data.target}（{@code target_tts} 为译文语音，P2 朗读再消费）。
     */
    private SpeechTranslateResult parseSpeechTranslate(String json) {
        JsonNode root;
        try {
            root = objectMapper.readTree(json);
        } catch (Exception e) {
            throw new BusinessException("TRANSLATE_FAILED", "解析百度语音响应失败", 502);
        }
        int code = root.path("code").asInt(-1);
        if (code != 0) {
            String msg = root.path("msg").asText("未知错误");
            throw mapBaiduVoiceError(code, msg);
        }
        JsonNode data = root.get("data");
        if (data == null) {
            throw new BusinessException("TRANSLATE_FAILED", "百度语音翻译返回数据为空", 502);
        }
        String source = data.path("source").asText("");
        String target = data.path("target").asText("");
        String rawTts = data.path("target_tts").asText(null);
        log.info("Baidu voice fields: sourceLen={}, targetLen={}, ttsLen={}",
                source.length(), target.length(), rawTts != null ? rawTts.length() : 0);
        return new SpeechTranslateResult(source, target);
    }

    /**
     * 语音翻译错误映射：百度 v2 接口使用 {@code code}/{@code msg} 而非通用接口的
     * {@code error_code}。基于 msg 语义给出友好中文提示，不暴露百度内部码。
     */
    private BusinessException mapBaiduVoiceError(int code, String msg) {
        String lower = msg == null ? "" : msg.toLowerCase();
        if (lower.contains("quota") || lower.contains("limit") || lower.contains("额度")
                || lower.contains("次数") || lower.contains("频率")) {
            return new BusinessException("TRANSLATE_QUOTA_EXHAUSTED", "本月免费额度已用尽，次月自动恢复", 429);
        }
        if (lower.contains("sign") || lower.contains("signature")
                || lower.contains("auth") || lower.contains("鉴权") || lower.contains("密钥")) {
            return new BusinessException("TRANSLATE_AUTH_FAILED", "翻译服务鉴权失败，请联系管理员", 502);
        }
        return new BusinessException("TRANSLATE_FAILED", "语音翻译失败：" + (msg == null ? "未知错误" : msg), 502);
    }

    /**
     * 解析图片翻译结果。百度实测响应将 content/sumSrc/sumDst/pasteImg 置于 {@code data} 对象内；
     * 兼容 content 位于根节点（部分文档形态）。
     */
    private ImageTranslateResult parseImageTranslate(JsonNode root) {
        JsonNode data = root.get("data");
        if (data == null) {
            data = root;
        }
        String from = data.path("from").asText("");
        String to = data.path("to").asText("");
        String sumSrc = data.path("sumSrc").asText("");
        String sumDst = data.path("sumDst").asText("");
        String rawPasteImg = data.path("pasteImg").asText(null);
        String pasteImg = normalizeImage(rawPasteImg);

        log.info("Baidu image fields: from={}, to={}, blocks={}, sumSrcLen={}, sumDstLen={}, pasteImgLen={}",
                from, to,
                data.has("content") && data.get("content").isArray() ? data.get("content").size() : 0,
                sumSrc.length(), sumDst.length(),
                rawPasteImg != null ? rawPasteImg.length() : 0);

        List<ImageTextBlock> blocks = new ArrayList<>();
        JsonNode content = data.get("content");
        if (content == null) {
            content = root.get("content");
        }
        if (content != null && content.isArray()) {
            for (JsonNode node : content) {
                blocks.add(new ImageTextBlock(
                        node.path("src").asText(""),
                        node.path("dst").asText(""),
                        node.path("rect").asText(null),
                        parsePoints(node.get("points")),
                        normalizeImage(node.path("pasteImg").asText(null))
                ));
            }
        }
        return new ImageTranslateResult(from, to, blocks, sumSrc, sumDst, pasteImg);
    }

    private List<ImagePoint> parsePoints(JsonNode points) {
        List<ImagePoint> result = new ArrayList<>();
        if (points != null && points.isArray()) {
            for (JsonNode p : points) {
                result.add(new ImagePoint(p.path("x").asInt(0), p.path("y").asInt(0)));
            }
        }
        return result;
    }

    /**
     * 将百度返回的纯 base64 渲染图补全为可直接渲染的 data URL；
     * 若已带 data: 前缀或为空则原样返回。
     */
    private String normalizeImage(String base64) {
        if (base64 == null || base64.isBlank()) {
            return null;
        }
        if (base64.startsWith("data:")) {
            return base64;
        }
        return "data:image/png;base64," + base64;
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

    /** 图片翻译结果 */
    public record ImageTranslateResult(String from, String to, List<ImageTextBlock> blocks,
                                       String sumSrc, String sumDst, String pasteImg) {
    }

    /** 单块 OCR 文本 + 逐块译文 */
    public record ImageTextBlock(String src, String dst, String rect,
                                 List<ImagePoint> points, String blockImage) {
    }

    /** 文本块多边形顶点（百度 points 数组） */
    public record ImagePoint(int x, int y) {
    }

    /** 语音翻译结果（识别原文 + 译文） */
    public record SpeechTranslateResult(String source, String target) {
    }
}
