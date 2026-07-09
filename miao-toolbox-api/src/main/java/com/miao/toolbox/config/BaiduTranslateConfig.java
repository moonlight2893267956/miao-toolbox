package com.miao.toolbox.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * 百度翻译代理层 HTTP 客户端配置。
 *
 * <p>为 {@link BaiduTranslateClient} 提供受超时约束的 {@link RestTemplate} Bean，
 * 连接/读取超时取自 {@link BaiduTranslateProperties}。
 */
@Configuration
public class BaiduTranslateConfig {

    @Bean
    public RestTemplate baiduRestTemplate(BaiduTranslateProperties properties) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(properties.getConnectTimeout());
        factory.setReadTimeout(properties.getReadTimeout());
        return new RestTemplate(factory);
    }
}
