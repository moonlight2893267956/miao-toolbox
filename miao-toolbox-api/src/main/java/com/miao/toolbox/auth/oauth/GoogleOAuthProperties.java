package com.miao.toolbox.auth.oauth;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "miao.oauth.google")
public class GoogleOAuthProperties {
    private String clientId;
    private String clientSecret;
    private String redirectUri = "http://localhost:8080/api/auth/oauth/google/callback";
    private String frontendCallbackUrl = "http://localhost:5173/oauth/callback";
    private String scope = "openid email profile";
}
