package com.miao.toolbox.common.exception;

import com.miao.toolbox.common.constant.ErrorCode;

public class AuthException extends BusinessException {

    public AuthException(String errorCode, String message) {
        super(errorCode, message, 401);
    }

    public AuthException(String errorCode, String message, int httpStatus) {
        super(errorCode, message, httpStatus);
    }

    public static AuthException loginFailed() {
        return new AuthException(ErrorCode.AUTH_LOGIN_FAILED, "用户名或密码错误");
    }

    public static AuthException tokenExpired() {
        return new AuthException(ErrorCode.AUTH_TOKEN_EXPIRED, "登录已过期，请重新登录");
    }

    public static AuthException tokenInvalid() {
        return new AuthException(ErrorCode.AUTH_TOKEN_INVALID, "无效的认证令牌");
    }

    public static AuthException userDisabled() {
        return new AuthException(ErrorCode.USER_DISABLED, "账号已被禁用");
    }

    public static AuthException userLocked() {
        return new AuthException(ErrorCode.USER_LOCKED, "账号已锁定，请15分钟后重试", 403);
    }
}
