package com.miao.toolbox.auth.controller;

import com.miao.toolbox.auth.dto.SendCodeRequest;
import com.miao.toolbox.auth.enums.EmailCodePurpose;
import com.miao.toolbox.auth.service.EmailCodeService;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.ApiResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("EmailController 单元测试")
class EmailControllerTest {

    @Mock
    private EmailCodeService emailCodeService;

    @InjectMocks
    private EmailController emailController;

    @Nested
    @DisplayName("POST /api/auth/email/send-code")
    class SendCodeTests {

        @Test
        @DisplayName("发送验证码 - 成功")
        void sendCode_success() {
            SendCodeRequest request = new SendCodeRequest("test@example.com", EmailCodePurpose.REGISTER);
            doNothing().when(emailCodeService).sendCode("test@example.com", EmailCodePurpose.REGISTER);

            ApiResponse<Void> response = emailController.sendCode(request);

            assertThat(response.getCode()).isEqualTo("SUCCESS");
            verify(emailCodeService).sendCode("test@example.com", EmailCodePurpose.REGISTER);
        }

        @Test
        @DisplayName("发送验证码 - 频率限制，抛出异常")
        void sendCode_rateLimited() {
            SendCodeRequest request = new SendCodeRequest("test@example.com", EmailCodePurpose.REGISTER);
            doThrow(new BusinessException(ErrorCode.EMAIL_CODE_RATE_LIMIT, "发送过于频繁"))
                    .when(emailCodeService).sendCode("test@example.com", EmailCodePurpose.REGISTER);

            assertThatThrownBy(() -> emailController.sendCode(request))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_CODE_RATE_LIMIT);
        }

        @Test
        @DisplayName("发送验证码 - 邮箱已注册（注册场景），抛出异常")
        void sendCode_emailExists() {
            SendCodeRequest request = new SendCodeRequest("test@example.com", EmailCodePurpose.REGISTER);
            doThrow(new BusinessException(ErrorCode.USER_ALREADY_EXISTS, "该邮箱已被注册"))
                    .when(emailCodeService).sendCode("test@example.com", EmailCodePurpose.REGISTER);

            assertThatThrownBy(() -> emailController.sendCode(request))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.USER_ALREADY_EXISTS);
        }
    }
}
