package com.miao.toolbox.tool.diff.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "miao.cos")
public class CosProperties {

    private String secretId;
    private String secretKey;
    private String bucket;
    private String region = "ap-guangzhou";
    private String basePath = "text-compare";
    private long maxFileSize = 100 * 1024 * 1024L; // 100MB
}
