package com.miao.toolbox.tool.scheduler.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SchedulerCryptoService 单元测试（FR-14 / AC3）。
 *
 * <p>纯单元测试：直接 new，不经 Spring 容器，验证 AES-GCM 加解密行为本身。
 */
@DisplayName("SchedulerCryptoService AES-GCM 加解密")
class SchedulerCryptoServiceTest {

    private static final String SECRET = "test-scheduler-crypto-secret-key";

    @DisplayName("AC3: 加密后可解密还原明文")
    @Test
    void encryptThenDecryptRoundTrip() {
        SchedulerCryptoService service = new SchedulerCryptoService(SECRET);
        String plain = "Bearer sk-abc123secret-token-value";

        String cipher = service.encrypt(plain);

        assertThat(cipher).isNotNull().isNotEqualTo(plain);
        assertThat(service.decrypt(cipher)).isEqualTo(plain);
    }

    @DisplayName("AC3: 相同明文两次加密密文不同（随机 IV）")
    @Test
    void encryptTwiceProducesDifferentCiphertexts() {
        SchedulerCryptoService service = new SchedulerCryptoService(SECRET);
        String plain = "same-plain-value";

        String cipher1 = service.encrypt(plain);
        String cipher2 = service.encrypt(plain);

        assertThat(cipher1).isNotEqualTo(cipher2);
        assertThat(service.decrypt(cipher1)).isEqualTo(plain);
        assertThat(service.decrypt(cipher2)).isEqualTo(plain);
    }

    @DisplayName("AC3: null 与空串原样返回（不加密空值）")
    @Test
    void nullAndEmptyPassThrough() {
        SchedulerCryptoService service = new SchedulerCryptoService(SECRET);

        assertThat(service.encrypt(null)).isNull();
        assertThat(service.encrypt("")).isEmpty();
        assertThat(service.decrypt(null)).isNull();
        assertThat(service.decrypt("")).isEmpty();
    }

    @DisplayName("AC3: 中文与特殊字符往返一致")
    @Test
    void unicodeRoundTrip() {
        SchedulerCryptoService service = new SchedulerCryptoService(SECRET);
        String plain = "中文密钥Bearer sk-测试+/\n换行";

        assertThat(service.decrypt(service.encrypt(plain))).isEqualTo(plain);
    }

    @DisplayName("密钥不匹配时解密失败（GCM 校验拒绝）")
    @Test
    void decryptWithWrongKeyFails() {
        SchedulerCryptoService service = new SchedulerCryptoService(SECRET);
        String cipher = service.encrypt("secret-value");

        SchedulerCryptoService other = new SchedulerCryptoService("another-secret-key");

        assertThatThrownBy(() -> other.decrypt(cipher))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("解密失败");
    }

    @DisplayName("密文被篡改时解密失败")
    @Test
    void decryptTamperedCiphertextFails() {
        SchedulerCryptoService service = new SchedulerCryptoService(SECRET);
        String cipher = service.encrypt("secret-value");
        String tampered = cipher.substring(0, cipher.length() - 4) + "AAAA";

        assertThatThrownBy(() -> service.decrypt(tampered))
                .isInstanceOf(IllegalStateException.class);
    }

    @DisplayName("密钥缺失时构造 fail-fast（静默降级会导致明文落库）")
    @Test
    void blankSecretFailsFast() {
        assertThatThrownBy(() -> new SchedulerCryptoService(""))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("scheduler.crypto.secret");
        assertThatThrownBy(() -> new SchedulerCryptoService("   "))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new SchedulerCryptoService(null))
                .isInstanceOf(IllegalStateException.class);
    }
}
