package com.miao.toolbox.auth.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("EmailSendService 单元测试")
class EmailSendServiceTest {

    @Mock
    private JavaMailSender mailSender;

    @Mock
    private MimeMessage mimeMessage;

    private EmailSendService emailSendService;

    @BeforeEach
    void setUp() {
        emailSendService = new EmailSendService();
        ReflectionTestUtils.setField(emailSendService, "mailSender", mailSender);
        ReflectionTestUtils.setField(emailSendService, "from", "noreply@example.com");
    }

    @Test
    @DisplayName("发送验证码邮件成功")
    void sendVerificationCode_success() {
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        assertThatCode(() -> emailSendService.sendVerificationCode("test@example.com", "123456", "注册验证"))
                .doesNotThrowAnyException();

        verify(mailSender).send(mimeMessage);
    }

    @Test
    @DisplayName("邮件发送失败，抛出 EMAIL_SEND_FAILED 异常")
    void sendVerificationCode_failed() {
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);
        doThrow(new RuntimeException("SMTP error")).when(mailSender).send(any(MimeMessage.class));

        assertThatThrownBy(() -> emailSendService.sendVerificationCode("test@example.com", "123456", "注册验证"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_SEND_FAILED);
    }

    @Test
    @DisplayName("JavaMailSender 未配置，抛出 EMAIL_SEND_FAILED 异常")
    void sendVerificationCode_mailSenderNotConfigured() {
        ReflectionTestUtils.setField(emailSendService, "mailSender", (Object) null);

        assertThatThrownBy(() -> emailSendService.sendVerificationCode("test@example.com", "123456", "注册验证"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_SEND_FAILED);
    }
}
