package com.miao.toolbox.network.config;

import com.miao.toolbox.network.infrastructure.HostResolver;
import com.miao.toolbox.network.infrastructure.NetworkClientFactory;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 网络工具箱 Phase 2 基础设施 Bean。
 */
@Configuration
public class NetworkInfrastructureConfig {

    @Bean
    public HostResolver hostResolver() {
        return HostResolver.jdk();
    }

    @Bean
    public SsrfProtector ssrfProtector(HostResolver hostResolver) {
        return new SsrfProtector(hostResolver);
    }

    @Bean
    public NetworkClientFactory networkClientFactory(SsrfProtector ssrfProtector) {
        return new NetworkClientFactory(ssrfProtector);
    }
}
