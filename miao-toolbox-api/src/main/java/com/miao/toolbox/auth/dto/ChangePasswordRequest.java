package com.miao.toolbox.auth.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ChangePasswordRequest {

    // 旧密码：设置页修改密码时必填，首次强制改密时不需要
    private String oldPassword;

    @Size(min = 8, max = 72, message = "密码长度为8-72位")
    private String newPassword;
}