package com.miao.toolbox.common.constant;

public final class ErrorCode {

    private ErrorCode() {}

    // Auth errors
    public static final String AUTH_LOGIN_FAILED = "AUTH_LOGIN_FAILED";
    public static final String AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED";
    public static final String AUTH_TOKEN_INVALID = "AUTH_TOKEN_INVALID";
    public static final String AUTH_UNAUTHORIZED = "AUTH_UNAUTHORIZED";

    // User errors
    public static final String USER_DISABLED = "USER_DISABLED";
    public static final String USER_LOCKED = "USER_LOCKED";
    public static final String USER_NOT_FOUND = "USER_NOT_FOUND";
    public static final String USER_ALREADY_EXISTS = "USER_ALREADY_EXISTS";

    // Rate limit errors
    public static final String RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED";

    // Validation errors
    public static final String VALIDATION_FAILED = "VALIDATION_FAILED";

    // System errors
    public static final String SYSTEM_ERROR = "SYSTEM_ERROR";

    // Diff tool errors
    public static final String DIFF_FILE_TOO_LARGE = "DIFF_FILE_TOO_LARGE";
    public static final String DIFF_COS_ERROR = "DIFF_COS_ERROR";
    public static final String DIFF_EMPTY_CONTENT = "DIFF_EMPTY_CONTENT";
    public static final String DIFF_FILE_NOT_FOUND = "DIFF_FILE_NOT_FOUND";
    public static final String DIFF_INVALID_REQUEST = "DIFF_INVALID_REQUEST";
}
