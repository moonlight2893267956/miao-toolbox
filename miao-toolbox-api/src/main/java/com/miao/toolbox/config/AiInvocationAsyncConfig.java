package com.miao.toolbox.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * AI 调用记录异步线程池配置。
 *
 * AiInvocationRecorder.persist() 使用 @Async("aiInvocationExecutor") 异步写入，
 * 避免阻塞业务请求线程。
 *
 * 配置项：
 * - ai.invocation.async.core-pool-size: 核心线程数，默认 2
 * - ai.invocation.async.max-pool-size: 最大线程数，默认 8
 * - ai.invocation.async.queue-capacity: 队列容量，默认 100
 */
@Configuration
public class AiInvocationAsyncConfig {

    @Bean("aiInvocationExecutor")
    public Executor aiInvocationExecutor(
            @Value("${ai.invocation.async.core-pool-size:2}") int corePoolSize,
            @Value("${ai.invocation.async.max-pool-size:8}") int maxPoolSize,
            @Value("${ai.invocation.async.queue-capacity:100}") int queueCapacity) {

        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("ai-inv-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
