package com.miao.toolbox.tool.diff.config;

import com.qcloud.cos.COSClient;
import com.qcloud.cos.ClientConfig;
import com.qcloud.cos.auth.BasicCOSCredentials;
import com.qcloud.cos.auth.COSCredentials;
import com.qcloud.cos.region.Region;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CosConfig {

    @Bean
    @ConditionalOnProperty(prefix = "miao.cos", name = "secret-id")
    public COSClient cosClient(CosProperties cosProperties) {
        COSCredentials credentials = new BasicCOSCredentials(
                cosProperties.getSecretId(),
                cosProperties.getSecretKey());
        ClientConfig clientConfig = new ClientConfig(new Region(cosProperties.getRegion()));
        return new COSClient(credentials, clientConfig);
    }
}
