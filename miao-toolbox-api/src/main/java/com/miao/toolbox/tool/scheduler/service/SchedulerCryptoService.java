package com.miao.toolbox.tool.scheduler.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 定时任务敏感字段加解密服务（FR-14）。
 *
 * <p>AES-GCM-256 对称加密，专用密钥 {@code scheduler.crypto.secret}（不复用 JWT secret，
 * 职责分离，PRD 决策 D-011）。密钥经 SHA-256 派生为 32 字节 AES 密钥，
 * 支持任意长度的配置字符串。IV（12 字节）每条密文独立随机生成，
 * 输出格式：Base64(IV || ciphertext || GCM tag)。
 *
 * <p>用途：scheduled_tasks.target_config 中 sensitive=true 的 header 值加密存储。
 * 空值原样返回（不加密空串）。密钥缺失时 fail-fast（启动失败），
 * 静默降级会导致敏感字段明文落库，属安全隐患。
 */
@Service
public class SchedulerCryptoService {

    private static final String AES_ALGORITHM = "AES";
    private static final String CIPHER_TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;

    private final SecretKey key;
    private final SecureRandom random = new SecureRandom();

    public SchedulerCryptoService(@Value("${scheduler.crypto.secret:}") String secret) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "scheduler.crypto.secret 未配置：定时任务模块需要专用加密密钥（生产环境通过环境变量 SCHEDULER_CRYPTO_SECRET 注入）");
        }
        try {
            byte[] keyBytes = MessageDigest.getInstance("SHA-256")
                    .digest(secret.getBytes(StandardCharsets.UTF_8));
            this.key = new SecretKeySpec(keyBytes, AES_ALGORITHM);
        } catch (Exception e) {
            throw new IllegalStateException("scheduler.crypto.secret 密钥派生失败: " + e.getMessage(), e);
        }
    }

    /**
     * 加密明文。空值原样返回。输出 Base64(IV || ciphertext || tag)。
     */
    public String encrypt(String plainText) {
        if (plainText == null || plainText.isEmpty()) {
            return plainText;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] cipherBytes = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            ByteBuffer buffer = ByteBuffer.allocate(iv.length + cipherBytes.length);
            buffer.put(iv).put(cipherBytes);
            return Base64.getEncoder().encodeToString(buffer.array());
        } catch (Exception e) {
            throw new IllegalStateException("敏感字段加密失败: " + e.getMessage(), e);
        }
    }

    /**
     * 解密密文。空值原样返回。密文被篡改时 GCM 校验失败抛出异常。
     */
    public String decrypt(String cipherText) {
        if (cipherText == null || cipherText.isEmpty()) {
            return cipherText;
        }
        try {
            byte[] all = Base64.getDecoder().decode(cipherText);
            if (all.length <= IV_BYTES) {
                throw new IllegalArgumentException("密文长度不足（缺少 IV 或密文体）");
            }
            byte[] iv = new byte[IV_BYTES];
            System.arraycopy(all, 0, iv, 0, IV_BYTES);
            byte[] cipherBytes = new byte[all.length - IV_BYTES];
            System.arraycopy(all, IV_BYTES, cipherBytes, 0, cipherBytes.length);

            Cipher cipher = Cipher.getInstance(CIPHER_TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] plainBytes = cipher.doFinal(cipherBytes);
            return new String(plainBytes, StandardCharsets.UTF_8);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("敏感字段解密失败（密文损坏或密钥不匹配）: " + e.getMessage(), e);
        }
    }
}
