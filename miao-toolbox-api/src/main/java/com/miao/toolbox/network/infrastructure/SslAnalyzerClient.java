package com.miao.toolbox.network.infrastructure;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.network.dto.SslCertificateField;
import com.miao.toolbox.network.dto.SslCertificateInfo;
import org.springframework.stereotype.Component;

import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLHandshakeException;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLPeerUnverifiedException;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509ExtendedTrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.security.KeyStore;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.CertPath;
import java.security.cert.CertPathValidator;
import java.security.cert.PKIXParameters;
import java.security.cert.TrustAnchor;
import java.security.cert.X509Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * SSL/TLS 证书分析客户端。
 *
 * <p>安全约束：连接目标必须经 {@link SsrfProtector#resolveAndValidate(String)} 校验，
 * 禁止直接连接用户传入的主机名，避免 SSRF。</p>
 *
 * <p>设计：使用 permissive 的 {@link RecordingTrustManager}（仅记录证书链、不中断握手），
 * 因此即便目标是自签名/过期证书也能完整拿到链信息；信任状态由 {@link #validateChain}
 * 用系统 CA 单独做 PKIX 校验得出。</p>
 */
@Component
public class SslAnalyzerClient {

    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'")
            .withZone(ZoneOffset.UTC);

    private final SsrfProtector ssrf;

    public SslAnalyzerClient(SsrfProtector ssrf) {
        this.ssrf = ssrf;
    }

    /**
     * 对指定主机发起 TLS 握手并解析证书信息。
     *
     * @param host   原始主机名（用于 SNI 与 SSRF 校验）
     * @param port   端口
     * @param timeout 超时
     */
    public SslAnalysisResult analyze(String host, int port, Duration timeout) throws SslAnalyzerException {
        // SSRF 校验在握手前：命中内网/重绑定直接抛 BusinessException（全局异常处理器转错误响应）
        InetAddress ip = ssrf.resolveAndValidate(host);
        String resolvedIp = ip.getHostAddress();

        long start = System.currentTimeMillis();
        RecordingTrustManager recordingTm = new RecordingTrustManager();
        try {
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[] { recordingTm }, new SecureRandom());
            SSLSocketFactory sf = ctx.getSocketFactory();

            try (SSLSocket socket = (SSLSocket) sf.createSocket()) {
                SSLParameters params = socket.getSSLParameters();
                try {
                    params.setServerNames(List.of(new SNIHostName(host)));
                } catch (IllegalArgumentException ignore) {
                    // 非法 SNI（如纯 IP）忽略，使用默认
                }
                socket.setSSLParameters(params);
                int to = (int) timeout.toMillis();
                socket.setSoTimeout(to);
                socket.connect(new InetSocketAddress(resolvedIp, port), to);
                socket.startHandshake();

                SSLSession session = socket.getSession();
                String protocol = session.getProtocol();
                String cipher = session.getCipherSuite();

                Certificate[] peer;
                try {
                    peer = session.getPeerCertificates();
                } catch (SSLPeerUnverifiedException e) {
                    peer = null;
                }

                List<SslCertificateInfo> chain = buildChain(peer);
                boolean recorded = recordingTm.getRecorded() != null;
                boolean peerVerified = recorded && validateChain(peer);

                return new SslAnalysisResult(
                        protocol,
                        cipher,
                        peerVerified,
                        peerVerified ? null : certErrorMessage(peer),
                        chain,
                        resolvedIp,
                        System.currentTimeMillis() - start);
            }
        } catch (SSLHandshakeException e) {
            throw new SslAnalyzerException(ErrorCode.NETWORK_SSL_HANDSHAKE_FAILED,
                    "SSL 握手失败: " + e.getMessage());
        } catch (SocketTimeoutException e) {
            throw new SslAnalyzerException(ErrorCode.NETWORK_CONNECTION_TIMEOUT,
                    "SSL 连接超时: " + host + ":" + port);
        } catch (IOException e) {
            throw new SslAnalyzerException(ErrorCode.NETWORK_CONNECTION_REFUSED,
                    "SSL 连接失败: " + host + ":" + port + " (" + e.getMessage() + ")");
        } catch (Exception e) {
            throw new SslAnalyzerException(ErrorCode.NETWORK_SSL_HANDSHAKE_FAILED,
                    "SSL 分析失败: " + e.getMessage());
        }
    }

    private String certErrorMessage(Certificate[] peer) {
        if (peer == null || peer.length == 0) {
            return "服务端未返回证书";
        }
        try {
            validateChain(peer);
            return null;
        } catch (Exception e) {
            String msg = e.getMessage();
            return msg == null ? "证书未通过系统 CA 信任校验" : msg;
        }
    }

    /** 用系统信任锚对证书链做 PKIX 校验，返回是否受信任。 */
    private boolean validateChain(Certificate[] peer) {
        if (peer == null || peer.length == 0) {
            return false;
        }
        try {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            CertPath cp = cf.generateCertPath(Arrays.asList(peer));

            TrustManagerFactory tmf = TrustManagerFactory.getInstance(
                    TrustManagerFactory.getDefaultAlgorithm());
            tmf.init((KeyStore) null);
            X509TrustManager defaultTm = (X509TrustManager) tmf.getTrustManagers()[0];

            Set<TrustAnchor> anchors = new HashSet<>();
            for (X509Certificate c : defaultTm.getAcceptedIssuers()) {
                anchors.add(new TrustAnchor(c, null));
            }
            PKIXParameters params = new PKIXParameters(anchors);
            params.setDate(new Date());
            params.setRevocationEnabled(false);
            CertPathValidator.getInstance("PKIX").validate(cp, params);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private List<SslCertificateInfo> buildChain(Certificate[] peer) {
        List<SslCertificateInfo> list = new ArrayList<>();
        if (peer == null) {
            return list;
        }
        for (int i = 0; i < peer.length; i++) {
            if (peer[i] instanceof X509Certificate x509) {
                list.add(buildCert(i, x509));
            }
        }
        return list;
    }

    private SslCertificateInfo buildCert(int index, X509Certificate cert) {
        Instant notBefore = cert.getNotBefore().toInstant();
        Instant notAfter = cert.getNotAfter().toInstant();
        long daysRemaining = java.time.temporal.ChronoUnit.DAYS.between(Instant.now(), notAfter);
        boolean expired = Instant.now().isAfter(notAfter);

        String serial = cert.getSerialNumber() != null
                ? "0x" + cert.getSerialNumber().toString(16).toUpperCase() : "";

        List<String> san = extractSan(cert);

        List<SslCertificateField> fields = new ArrayList<>();
        fields.add(new SslCertificateField("序列号", serial));
        fields.add(new SslCertificateField("有效期起始", ISO.format(notBefore)));
        fields.add(new SslCertificateField("有效期截止", ISO.format(notAfter)));
        fields.add(new SslCertificateField("剩余天数", String.valueOf(daysRemaining)));
        fields.add(new SslCertificateField("签名算法", safe(cert.getSigAlgName())));
        fields.add(new SslCertificateField("公钥算法", safe(cert.getPublicKey().getAlgorithm())));
        fields.add(new SslCertificateField("公钥长度", String.valueOf(publicKeySize(cert.getPublicKey()))));
        if (!san.isEmpty()) {
            fields.add(new SslCertificateField("主题备用名称(SAN)", String.join(", ", san)));
        }
        fields.add(new SslCertificateField("版本", "v" + cert.getVersion()));

        return SslCertificateInfo.builder()
                .index(index)
                .subject(safe(cert.getSubjectX500Principal().getName()))
                .issuer(safe(cert.getIssuerX500Principal().getName()))
                .serialNumber(serial)
                .notBefore(ISO.format(notBefore))
                .notAfter(ISO.format(notAfter))
                .daysRemaining(daysRemaining)
                .expired(expired)
                .signatureAlgorithm(safe(cert.getSigAlgName()))
                .publicKeyAlgorithm(safe(cert.getPublicKey().getAlgorithm()))
                .publicKeySize(publicKeySize(cert.getPublicKey()))
                .san(san)
                .fields(fields)
                .build();
    }

    private List<String> extractSan(X509Certificate cert) {
        List<String> result = new ArrayList<>();
        try {
            Collection<List<?>> sans = cert.getSubjectAlternativeNames();
            if (sans == null) {
                return result;
            }
            for (List<?> entry : sans) {
                if (entry.size() < 2) {
                    continue;
                }
                Integer type = (Integer) entry.get(0);
                Object value = entry.get(1);
                // 2 = dNSName, 7 = iPAddress
                if ((type == 2 || type == 7) && value != null) {
                    result.add(value.toString());
                }
            }
        } catch (CertificateException ignore) {
            // SAN 解析失败不影响主流程
        }
        return result;
    }

    private int publicKeySize(PublicKey key) {
        try {
            if (key instanceof RSAPublicKey rsa) {
                return rsa.getModulus().bitLength();
            }
            if (key instanceof ECPublicKey ec) {
                return ec.getParams().getCurve().getField().getFieldSize();
            }
        } catch (Exception ignore) {
            // ignore
        }
        return 0;
    }

    private String safe(String s) {
        return s == null ? "" : s;
    }

    /** 仅记录服务端证书链、不抛异常，确保握手能完成以拿到证书。 */
    private static class RecordingTrustManager extends X509ExtendedTrustManager {
        private X509Certificate[] recorded;

        X509Certificate[] getRecorded() {
            return recorded;
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType, java.net.Socket socket)
                throws CertificateException {
            throw new CertificateException("client auth not supported");
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType, javax.net.ssl.SSLEngine engine)
                throws CertificateException {
            throw new CertificateException("client auth not supported");
        }

        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            throw new CertificateException("client auth not supported");
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType, java.net.Socket socket) {
            recorded = chain;
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType, javax.net.ssl.SSLEngine engine) {
            recorded = chain;
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {
            recorded = chain;
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    }

    /** SSL 分析结果内部载体。 */
    public static class SslAnalysisResult {
        private final String protocol;
        private final String cipherSuite;
        private final boolean peerVerified;
        private final String certificateError;
        private final List<SslCertificateInfo> chain;
        private final String resolvedIp;
        private final long handshakeTimeMs;

        public SslAnalysisResult(String protocol, String cipherSuite, boolean peerVerified,
                                 String certificateError, List<SslCertificateInfo> chain,
                                 String resolvedIp, long handshakeTimeMs) {
            this.protocol = protocol;
            this.cipherSuite = cipherSuite;
            this.peerVerified = peerVerified;
            this.certificateError = certificateError;
            this.chain = chain;
            this.resolvedIp = resolvedIp;
            this.handshakeTimeMs = handshakeTimeMs;
        }

        public String getProtocol() {
            return protocol;
        }

        public String getCipherSuite() {
            return cipherSuite;
        }

        public boolean isPeerVerified() {
            return peerVerified;
        }

        public String getCertificateError() {
            return certificateError;
        }

        public List<SslCertificateInfo> getChain() {
            return chain;
        }

        public String getResolvedIp() {
            return resolvedIp;
        }

        public long getHandshakeTimeMs() {
            return handshakeTimeMs;
        }
    }
}
