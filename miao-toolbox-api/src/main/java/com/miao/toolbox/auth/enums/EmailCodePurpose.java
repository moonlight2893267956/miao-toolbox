package com.miao.toolbox.auth.enums;

/**
 * 邮箱验证码用途枚举
 */
public enum EmailCodePurpose {
    /** 注册验证 */
    REGISTER,
    /** 绑定/修改邮箱 */
    BIND_EMAIL,
    /** 找回密码 */
    RESET_PASSWORD
}
