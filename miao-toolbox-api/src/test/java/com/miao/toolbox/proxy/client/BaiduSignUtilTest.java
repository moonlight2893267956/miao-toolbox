package com.miao.toolbox.proxy.client;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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
}
