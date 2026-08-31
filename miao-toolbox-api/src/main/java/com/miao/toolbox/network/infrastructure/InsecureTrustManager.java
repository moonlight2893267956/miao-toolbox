package com.miao.toolbox.network.infrastructure;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;

/**
 * 跳过 TLS 证书校验的信任管理器（仅用于运行环境 JVM 不信任证书签名的公开站点兜底）。
 *
 * <p><b>安全前提</b>：调用方（{@link HttpFetcher#fetchContentInsecure}）必须已经完成 SSRF 校验，
 * 本类只放宽证书信任，不会让请求访问内网/保留地址。切勿在普通请求路径使用。
 */
final class InsecureTrustManager {

    static final X509TrustManager TRUST_ALL_MANAGER = new X509TrustManager() {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {
            // 不校验
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {
            // 不校验
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    };

    private static SSLSocketFactory factory;

    static SSLSocketFactory trustAllSslSocketFactory() {
        if (factory == null) {
            try {
                SSLContext ctx = SSLContext.getInstance("TLS");
                ctx.init(null, new TrustManager[]{TRUST_ALL_MANAGER}, new SecureRandom());
                factory = ctx.getSocketFactory();
            } catch (Exception e) {
                throw new IllegalStateException("无法初始化跳过证书校验的 SSLContext", e);
            }
        }
        return factory;
    }

    private InsecureTrustManager() {}
}
