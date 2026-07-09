package com.miao.toolbox.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 百度翻译开放平台配置。
 *
 * <p>配置前缀: {@code miao.baidu.translate}
 *
 * <pre>
 * miao:
 *   baidu:
 *     translate:
 *       enabled: ${BAIDU_TRANSLATE_ENABLED:false}
 *       app-id: ${BAIDU_APPID:}
 *       secret: ${BAIDU_SECRET:}
 *       translate-url: ${BAIDU_TRANSLATE_URL:...}
 *       detect-url: ${BAIDU_DETECT_URL:...}
 *       connect-timeout: ${BAIDU_CONNECT_TIMEOUT:5000}
 *       read-timeout: ${BAIDU_READ_TIMEOUT:60000}
 *       max-concurrency: ${BAIDU_MAX_CONCURRENCY:10}
 * </pre>
 *
 * <p>密钥（app-id/secret）仅经环境变量注入，提交文件中不出现明文。
 */
@Data
@Component
@ConfigurationProperties(prefix = "miao.baidu.translate")
public class BaiduTranslateProperties {

    /** 是否启用百度翻译代理（未配置密钥时关闭，避免空调用） */
    private boolean enabled = false;

    /** 百度翻译 appid */
    private String appId = "";

    /** 百度翻译密钥 */
    private String secret = "";

    /** 通用翻译 API 地址 */
    private String translateUrl = "https://fanyi-api.baidu.com/api/trans/vip/translate";

    /** 语种识别 API 地址 */
    private String detectUrl = "https://fanyi-api.baidu.com/langid/v1/detect";

    /** HTTP 连接超时（毫秒） */
    private int connectTimeout = 5000;

    /** HTTP 读取超时（毫秒） */
    private int readTimeout = 60000;

    /** 最大并发数（对应百度高级版 QPS=10，信号量守护） */
    private int maxConcurrency = 10;
}
