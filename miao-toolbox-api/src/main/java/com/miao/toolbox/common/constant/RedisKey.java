package com.miao.toolbox.common.constant;

public final class RedisKey {

    private RedisKey() {}

    public static final String NONCE_PREFIX = "miao:nonce:";
    public static final String RATE_LIMIT_USER_PREFIX = "miao:ratelimit:user:";
    public static final String RATE_LIMIT_IP_PREFIX = "miao:ratelimit:ip:";
    public static final String USER_STATUS_PREFIX = "miao:user:status:";
    public static final String SESSION_PREFIX = "miao:session:";
    public static final String SIGNING_KEY_TRANSITION_PREFIX = "miao:signing:transition:";
    public static final String RATE_LIMIT_CUSTOM_PREFIX = "miao:ratelimit:custom:";
    public static final String USER_ROUTES_PREFIX = "miao:routes:user:";

    // Email verification code
    /** Verification code content, value = code:purpose, TTL = expire-minutes */
    public static final String EMAIL_CODE_PREFIX = "miao:email:code:";
    /** Hourly send count, value = count, TTL = 1h */
    public static final String EMAIL_SEND_COUNT_PREFIX = "miao:email:send:count:";
    /** Daily verify count, value = count, TTL = 24h */
    public static final String EMAIL_VERIFY_COUNT_PREFIX = "miao:email:verify:count:";
}
