package com.miao.toolbox.auth.service;

import com.miao.toolbox.auth.enums.EmailCodePurpose;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("EmailCodeService 单元测试")
class EmailCodeServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @Mock
    private EmailSendService emailSendService;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private EmailCodeService emailCodeService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(emailCodeService, "expireMinutes", 5);
        ReflectionTestUtils.setField(emailCodeService, "maxSendPerHour", 5);
        ReflectionTestUtils.setField(emailCodeService, "maxVerifyPerDay", 10);
        ReflectionTestUtils.setField(emailCodeService, "codeLength", 6);
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Nested
    @DisplayName("sendCode 测试")
    class SendCodeTests {

        @Test
        @DisplayName("注册场景 - 邮箱未注册，发送成功")
        void sendCode_register_success() {
            when(valueOperations.get(startsWith("miao:email:send:count:"))).thenReturn(null);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@example.com")).thenReturn(Optional.empty());

            emailCodeService.sendCode("test@example.com", EmailCodePurpose.REGISTER);

            verify(valueOperations).set(startsWith("miao:email:code:"), contains(":REGISTER"), eq(5L), any());
            verify(emailSendService).sendVerificationCode(eq("test@example.com"), anyString(), eq("注册验证"));
        }

        @Test
        @DisplayName("注册场景 - 邮箱已注册，抛出异常")
        void sendCode_register_emailExists() {
            when(valueOperations.get(startsWith("miao:email:send:count:"))).thenReturn(null);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@example.com"))
                    .thenReturn(Optional.of(mock(com.miao.toolbox.auth.entity.User.class)));

            assertThatThrownBy(() -> emailCodeService.sendCode("test@example.com", EmailCodePurpose.REGISTER))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.USER_ALREADY_EXISTS);
        }

        @Test
        @DisplayName("找回密码场景 - 邮箱已注册，发送成功")
        void sendCode_resetPassword_success() {
            when(valueOperations.get(startsWith("miao:email:send:count:"))).thenReturn(null);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@example.com"))
                    .thenReturn(Optional.of(mock(com.miao.toolbox.auth.entity.User.class)));

            emailCodeService.sendCode("test@example.com", EmailCodePurpose.RESET_PASSWORD);

            verify(emailSendService).sendVerificationCode(eq("test@example.com"), anyString(), eq("找回密码"));
        }

        @Test
        @DisplayName("找回密码场景 - 邮箱未注册，抛出异常")
        void sendCode_resetPassword_emailNotFound() {
            when(valueOperations.get(startsWith("miao:email:send:count:"))).thenReturn(null);
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@example.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> emailCodeService.sendCode("test@example.com", EmailCodePurpose.RESET_PASSWORD))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.USER_NOT_FOUND);
        }

        @Test
        @DisplayName("发送频率限制 - 超过每小时上限，抛出异常")
        void sendCode_rateLimitExceeded() {
            when(valueOperations.get(startsWith("miao:email:send:count:"))).thenReturn("5");

            assertThatThrownBy(() -> emailCodeService.sendCode("test@example.com", EmailCodePurpose.REGISTER))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_CODE_RATE_LIMIT);
        }

        @Test
        @DisplayName("发送频率限制 - 未超限，正常发送并递增计数")
        void sendCode_withinRateLimit() {
            when(valueOperations.get(startsWith("miao:email:send:count:"))).thenReturn("3");
            when(userRepository.findByEmailAndEmailVerifiedTrue("test@example.com")).thenReturn(Optional.empty());

            emailCodeService.sendCode("test@example.com", EmailCodePurpose.REGISTER);

            verify(valueOperations).increment(startsWith("miao:email:send:count:"));
        }
    }

    @Nested
    @DisplayName("verifyCode 测试")
    class VerifyCodeTests {

        @Test
        @DisplayName("验证码正确，返回 true 并删除验证码")
        void verifyCode_correct() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn(null);
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn("123456:REGISTER");

            boolean result = emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.REGISTER);

            assertThat(result).isTrue();
            verify(redisTemplate).delete(startsWith("miao:email:code:"));
        }

        @Test
        @DisplayName("验证码错误，返回 false")
        void verifyCode_wrongCode() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn(null);
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn("123456:REGISTER");

            boolean result = emailCodeService.verifyCode("test@example.com", "654321", EmailCodePurpose.REGISTER);

            assertThat(result).isFalse();
            verify(redisTemplate, never()).delete(anyString());
        }

        @Test
        @DisplayName("验证码已过期，抛出异常")
        void verifyCode_expired() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn(null);
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn(null);

            assertThatThrownBy(() -> emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.REGISTER))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_CODE_EXPIRED);
        }

        @Test
        @DisplayName("验证码用途不匹配，抛出异常")
        void verifyCode_purposeMismatch() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn(null);
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn("123456:REGISTER");

            assertThatThrownBy(() -> emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.RESET_PASSWORD))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_CODE_PURPOSE_MISMATCH);
        }

        @Test
        @DisplayName("验证次数超过每日上限，抛出异常")
        void verifyCode_dailyLimitExceeded() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn("10");

            assertThatThrownBy(() -> emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.REGISTER))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_VERIFY_RATE_LIMIT);
        }
    }

    @Nested
    @DisplayName("peekCode 测试（只校验不消费）")
    class PeekCodeTests {

        @Test
        @DisplayName("验证码正确，返回 true 且不删除验证码")
        void peekCode_correct_doesNotConsume() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn(null);
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn("123456:REGISTER");

            boolean result = emailCodeService.peekCode("test@example.com", "123456", EmailCodePurpose.REGISTER);

            assertThat(result).isTrue();
            // 关键：peek 模式不能消费验证码，否则最终提交会因验证码已被删除而失败
            verify(redisTemplate, never()).delete(anyString());
        }

        @Test
        @DisplayName("验证码错误，返回 false 且不删除验证码")
        void peekCode_wrongCode() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn(null);
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn("123456:REGISTER");

            boolean result = emailCodeService.peekCode("test@example.com", "654321", EmailCodePurpose.REGISTER);

            assertThat(result).isFalse();
            verify(redisTemplate, never()).delete(anyString());
        }

        @Test
        @DisplayName("验证码已过期，抛出异常")
        void peekCode_expired() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn(null);
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn(null);

            assertThatThrownBy(() -> emailCodeService.peekCode("test@example.com", "123456", EmailCodePurpose.REGISTER))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_CODE_EXPIRED);
        }

        @Test
        @DisplayName("验证码用途不匹配，抛出异常")
        void peekCode_purposeMismatch() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn(null);
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn("123456:REGISTER");

            assertThatThrownBy(() -> emailCodeService.peekCode("test@example.com", "123456", EmailCodePurpose.RESET_PASSWORD))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_CODE_PURPOSE_MISMATCH);
        }

        @Test
        @DisplayName("验证次数超过每日上限，抛出异常（peek 同样受限流约束，防暴力破解）")
        void peekCode_dailyLimitExceeded() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn("10");

            assertThatThrownBy(() -> emailCodeService.peekCode("test@example.com", "123456", EmailCodePurpose.REGISTER))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_VERIFY_RATE_LIMIT);
        }

        @Test
        @DisplayName("peek 校验失败也递增每日验证计数")
        void peekCode_wrongCode_incrementsVerifyCount() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn("3");
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn("123456:REGISTER");

            boolean result = emailCodeService.peekCode("test@example.com", "999999", EmailCodePurpose.REGISTER);

            assertThat(result).isFalse();
            verify(valueOperations).increment(startsWith("miao:email:verify:count:"));
        }

        @Test
        @DisplayName("peek 校验成功后仍可继续消费（verifyCode 幂等前置校验）")
        void peekCode_thenVerifyCode_succeeds() {
            when(valueOperations.get(startsWith("miao:email:verify:count:"))).thenReturn(null);
            when(valueOperations.get(startsWith("miao:email:code:"))).thenReturn("123456:RESET_PASSWORD");

            boolean peeked = emailCodeService.peekCode("test@example.com", "123456", EmailCodePurpose.RESET_PASSWORD);
            boolean verified = emailCodeService.verifyCode("test@example.com", "123456", EmailCodePurpose.RESET_PASSWORD);

            assertThat(peeked).isTrue();
            assertThat(verified).isTrue();
            verify(redisTemplate, times(1)).delete(startsWith("miao:email:code:"));
        }
    }
}
