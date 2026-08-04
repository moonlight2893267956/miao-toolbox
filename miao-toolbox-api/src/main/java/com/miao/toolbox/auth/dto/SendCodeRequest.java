package com.miao.toolbox.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import com.miao.toolbox.auth.enums.EmailCodePurpose;
import jakarta.validation.constraints.Pattern;

/**
 * 发送邮箱验证码请求
 */
public record SendCodeRequest(
        @NotBlank(message = "邮箱不能为空")
        @Email(message = "邮箱格式不正确")
        String email,

        @NotNull(message = "用途不能为空")
        EmailCodePurpose purpose
) {}
