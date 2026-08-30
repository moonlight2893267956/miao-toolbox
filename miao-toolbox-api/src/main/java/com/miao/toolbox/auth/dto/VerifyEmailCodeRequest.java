package com.miao.toolbox.auth.dto;

import com.miao.toolbox.auth.enums.EmailCodePurpose;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * 邮箱验证码分步校验请求（只校验，不消费验证码）
 */
public record VerifyEmailCodeRequest(
        @NotBlank(message = "邮箱不能为空")
        @Email(message = "邮箱格式不正确")
        String email,

        @NotBlank(message = "验证码不能为空")
        @Pattern(regexp = "\\d{6}", message = "验证码为 6 位数字")
        String code,

        @NotNull(message = "用途不能为空")
        EmailCodePurpose purpose
) {}
