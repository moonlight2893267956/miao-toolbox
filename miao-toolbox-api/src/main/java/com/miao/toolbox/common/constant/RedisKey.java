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
}
