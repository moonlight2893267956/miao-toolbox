package com.miao.toolbox;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 为集成测试提供 mock RedisTemplate，避免需要真实 Redis 连接。
 * 仅在 test profile 下生效，@SpringBootTest 会自动导入。
 */
@TestConfiguration
public class TestRedisConfig {

    @Bean
    @Primary
    @SuppressWarnings("unchecked")
    public RedisTemplate<String, Object> redisTemplate() {
        RedisTemplate<String, Object> rt = mock(RedisTemplate.class);
        ValueOperations<String, Object> vo = mock(ValueOperations.class);
        when(rt.opsForValue()).thenReturn(vo);
        return rt;
    }

    @Bean
    @Primary
    public RedisConnectionFactory redisConnectionFactory() {
        return mock(RedisConnectionFactory.class);
    }
}
