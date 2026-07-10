package com.miao.toolbox.proxy.client;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * 百度翻译签名工具。
 *
 * <p>百度开放平台要求每次请求携带 {@code sign = MD5(appid + q + salt + secret)}，
 * 其中 {@code salt} 为随机串，{@code sign} 为小写十六进制 MD5 摘要。
 * 签名基于原始字符串（未 URL 编码）计算。
 */
public final class BaiduSignUtil {

    private BaiduSignUtil() {
    }

    /**
     * 生成百度翻译请求签名。
     *
     * @param appId  百度 appid
     * @param query  待翻译/识别文本（与请求体中的 q 完全一致）
     * @param salt   随机盐值
     * @param secret 百度密钥
     * @return 小写十六进制 MD5 摘要
     */
    public static String sign(String appId, String query, String salt, String secret) {
        String input = appId + query + salt + secret;
        return md5Hex(input);
    }

    /**
     * 生成百度图片翻译请求签名。
     *
     * <p>图片翻译无 {@code q} 文本，签名规则与文本翻译不同：
     * {@code sign = MD5(appId + MD5(imageBytes) + salt + cuid + mac + secret)}，
     * 其中 {@code MD5(imageBytes)} 为图片原始字节的 32 位小写 MD5 摘要。
     *
     * @param appId    百度 appid
     * @param imageMd5 图片原始字节的 MD5 小写十六进制（见 {@link #md5Hex(byte[])}）
     * @param salt     随机盐值
     * @param cuid     设备/调用方标识（服务端代理固定值）
     * @param mac      设备 MAC 标识（服务端代理固定值）
     * @param secret   百度密钥
     * @return 小写十六进制 MD5 摘要
     */
    public static String signImage(String appId, String imageMd5, String salt,
                                   String cuid, String mac, String secret) {
        String input = appId + imageMd5 + salt + cuid + mac + secret;
        return md5Hex(input);
    }

    /**
     * 生成随机盐值（纳秒时间戳，保证单次请求唯一）。
     */
    public static String randomSalt() {
        return String.valueOf(System.nanoTime());
    }

    private static String md5Hex(String input) {
        return md5Hex(input.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 计算字节数组的 MD5 小写十六进制摘要（图片翻译用于 {@code MD5(imageBytes)}）。
     */
    public static String md5Hex(byte[] input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(input);
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("MD5 算法不可用", e);
        }
    }
}
