package com.miao.toolbox.proxy.client;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("BaiduSignUtil 签名工具测试")
class BaiduSignUtilTest {

    @Test
    @DisplayName("sign 与 MD5(abc) 已知值一致")
    void sign_knownValue() {
        // appId+q+salt+secret = "a"+"b"+"c"+"" = "abc"，MD5("abc") 已知
        assertEquals("900150983cd24fb0d6963f7d28e17f72", BaiduSignUtil.sign("a", "b", "c", ""));
    }

    @Test
    @DisplayName("sign 结果为 32 位小写十六进制")
    void sign_format() {
        String sign = BaiduSignUtil.sign("appid", "hello world", "123", "secret");
        assertEquals(32, sign.length());
        assertTrue(sign.matches("^[0-9a-f]{32}$"));
    }

    @Test
    @DisplayName("相同输入产生相同签名（确定性）")
    void sign_deterministic() {
        String a = BaiduSignUtil.sign("appid", "text", "salt", "secret");
        String b = BaiduSignUtil.sign("appid", "text", "salt", "secret");
        assertEquals(a, b);
    }

    @Test
    @DisplayName("不同输入产生不同签名")
    void sign_distinct() {
        String a = BaiduSignUtil.sign("appid", "text", "salt1", "secret");
        String b = BaiduSignUtil.sign("appid", "text", "salt2", "secret");
        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("randomSalt 返回非空且每次不同")
    void randomSalt_unique() {
        String s1 = BaiduSignUtil.randomSalt();
        String s2 = BaiduSignUtil.randomSalt();
        assertNotNull(s1);
        assertFalse(s1.isBlank());
        assertNotEquals(s1, s2);
    }

    @Test
    @DisplayName("signImage 确定性 + 32 位小写十六进制")
    void signImage_format() {
        String imageMd5 = BaiduSignUtil.md5Hex("fake-image-bytes".getBytes(StandardCharsets.UTF_8));
        String sign1 = BaiduSignUtil.signImage("app1", imageMd5, "salt1", "cuid", "mac", "sec1");
        String sign2 = BaiduSignUtil.signImage("app1", imageMd5, "salt1", "cuid", "mac", "sec1");
        assertEquals(32, sign1.length());
        assertTrue(sign1.matches("^[0-9a-f]{32}$"));
        assertEquals(sign1, sign2);
    }

    @Test
    @DisplayName("signImage 含图片MD5 + cuid + mac，与文本 sign 不同")
    void signImage_distinctFromTextSign() {
        String imageMd5 = BaiduSignUtil.md5Hex("abc".getBytes(StandardCharsets.UTF_8));
        String imageSign = BaiduSignUtil.signImage("app1", imageMd5, "salt", "cuid", "mac", "sec");
        String textSign = BaiduSignUtil.sign("app1", "abc", "salt", "sec");
        assertNotEquals(imageSign, textSign);
    }

    @Test
    @DisplayName("md5Hex(byte[]) 已知值 MD5(abc) + 与文本签名复用一致")
    void md5Hex_byteArray() {
        assertEquals("900150983cd24fb0d6963f7d28e17f72",
                BaiduSignUtil.md5Hex("abc".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    @DisplayName("signVoice 确定性：相同 appId/密钥/时间戳/音频 产生相同签名")
    void signVoice_deterministic() {
        String a = BaiduSignUtil.signVoice("app1", "vsec", "1700000000", "VOICE");
        String b = BaiduSignUtil.signVoice("app1", "vsec", "1700000000", "VOICE");
        assertEquals(a, b);
    }

    @Test
    @DisplayName("signVoice 不同音频产生不同签名")
    void signVoice_distinct() {
        String a = BaiduSignUtil.signVoice("app1", "vsec", "1700000000", "VOICE");
        String b = BaiduSignUtil.signVoice("app1", "vsec", "1700000000", "OTHER");
        assertNotEquals(a, b);
    }

    @Test
    @DisplayName("signVoice 输出为合法 base64 串")
    void signVoice_base64Format() {
        String sign = BaiduSignUtil.signVoice("app1", "vsec", "1700000000", "VOICE");
        assertFalse(sign.isBlank());
        assertTrue(sign.matches("^[A-Za-z0-9+/=]+$"), "应为 base64");
    }

    @Test
    @DisplayName("signVoice(HMAC-SHA256) 与 MD5 sign 算法不同、结果不同")
    void signVoice_distinctFromMd5Sign() {
        String voice = BaiduSignUtil.signVoice("app1", "vsec", "1700000000", "VOICE");
        String md5 = BaiduSignUtil.sign("app1", "VOICE", "1700000000", "vsec");
        assertNotEquals(voice, md5);
    }
}
