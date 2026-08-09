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

    // Role errors
    public static final String ROLE_NOT_FOUND = "ROLE_NOT_FOUND";
    public static final String ROLE_SYSTEM_PROTECTED = "ROLE_SYSTEM_PROTECTED";
    public static final String ROLE_HAS_USERS = "ROLE_HAS_USERS";

    // Route errors
    public static final String ROUTE_NOT_FOUND = "ROUTE_NOT_FOUND";
    public static final String ROUTE_FORBIDDEN = "ROUTE_FORBIDDEN";

    // Permission errors
    public static final String PERMISSION_DENIED = "PERMISSION_DENIED";

    // File storage errors
    public static final String FILE_NOT_FOUND = "FILE_NOT_FOUND";

    // Invite errors
    public static final String INVITE_TOKEN_INVALID = "INVITE_TOKEN_INVALID";
    public static final String INVITE_TOKEN_EXPIRED = "INVITE_TOKEN_EXPIRED";
    public static final String INVITE_ROLE_NOT_INVITABLE = "INVITE_ROLE_NOT_INVITABLE";

    // System errors
    public static final String SYSTEM_ERROR = "SYSTEM_ERROR";

    // Diff tool errors
    public static final String DIFF_FILE_TOO_LARGE = "DIFF_FILE_TOO_LARGE";
    public static final String DIFF_COS_ERROR = "DIFF_COS_ERROR";
    public static final String DIFF_EMPTY_CONTENT = "DIFF_EMPTY_CONTENT";
    public static final String DIFF_FILE_NOT_FOUND = "DIFF_FILE_NOT_FOUND";
    public static final String DIFF_INVALID_REQUEST = "DIFF_INVALID_REQUEST";

    // Email verification errors
    public static final String EMAIL_SEND_FAILED = "EMAIL_SEND_FAILED";
    public static final String EMAIL_CODE_EXPIRED = "EMAIL_CODE_EXPIRED";
    public static final String EMAIL_CODE_INVALID = "EMAIL_CODE_INVALID";
    public static final String EMAIL_CODE_RATE_LIMIT = "EMAIL_CODE_RATE_LIMIT";
    public static final String EMAIL_VERIFY_RATE_LIMIT = "EMAIL_VERIFY_RATE_LIMIT";
    public static final String EMAIL_NOT_SET = "EMAIL_NOT_SET";
    public static final String EMAIL_ALREADY_VERIFIED = "EMAIL_ALREADY_VERIFIED";
    public static final String EMAIL_CODE_PURPOSE_MISMATCH = "EMAIL_CODE_PURPOSE_MISMATCH";

    // Network toolbox (server-side proxy tools)
    public static final String NETWORK_DNS_RESOLVE_FAILED = "NETWORK_DNS_RESOLVE_FAILED";
    public static final String NETWORK_CONNECTION_TIMEOUT = "NETWORK_CONNECTION_TIMEOUT";
    public static final String NETWORK_CONNECTION_REFUSED = "NETWORK_CONNECTION_REFUSED";
    public static final String NETWORK_SSL_HANDSHAKE_FAILED = "NETWORK_SSL_HANDSHAKE_FAILED";
    public static final String NETWORK_HOST_UNREACHABLE = "NETWORK_HOST_UNREACHABLE";
    public static final String NETWORK_SSRF_BLOCKED = "NETWORK_SSRF_BLOCKED";
    public static final String NETWORK_INVALID_INPUT = "NETWORK_INVALID_INPUT";
    public static final String NETWORK_RATE_LIMITED = "NETWORK_RATE_LIMITED";
    public static final String NETWORK_HTTP_FETCH_FAILED = "NETWORK_HTTP_FETCH_FAILED";
}
