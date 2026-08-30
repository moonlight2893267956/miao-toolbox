package com.miao.toolbox.auth.dto;

/**
 * 邮箱验证码分步校验响应
 *
 * @param valid true 表示验证码正确（该校验不会消耗验证码，最终提交时仍会再次校验）
 */
public record VerifyEmailCodeResponse(boolean valid) {}
