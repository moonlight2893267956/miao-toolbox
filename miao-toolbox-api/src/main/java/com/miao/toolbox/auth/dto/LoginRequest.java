package com.miao.toolbox.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class LoginRequest {

    @NotBlank(message = "用户名不能为空")
    private String username;

    // #14: 限制密码最大长度，防止 BCrypt DoS（BCrypt 超过 72 字节会截断）
    @NotBlank(message = "密码不能为空")
    @Size(max = 128, message = "密码长度不能超过128位")
    private String password;
}
