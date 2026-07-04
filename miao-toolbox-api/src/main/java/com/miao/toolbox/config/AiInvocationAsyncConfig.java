package com.miao.toolbox.config;

import com.miao.toolbox.observability.MiaoAiProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * AI 调用记录异步线程池配置。
 *
 * <p>AiInvocationRecorder.persist() 使用 @Async("aiInvocationExecutor") 异步写入，
 * 避免阻塞业务请求线程。
 *
 * <p>配置项统一在 miao.ai.invocation.async 下管理。
 */
@Configuration
@RequiredArgsConstructor
public class AiInvocationAsyncConfig {

    private final MiaoAiProperties miaoAiProperties;

    @Bean("aiInvocationExecutor")
    public Executor aiInvocationExecutor() {
        MiaoAiProperties.Invocation.Async async = miaoAiProperties.getInvocation().getAsync();

        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(async.getCorePoolSize());
        executor.setMaxPoolSize(async.getMaxPoolSize());
        executor.setQueueCapacity(async.getQueueCapacity());
        executor.setThreadNamePrefix("ai-inv-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
