package com.miao.toolbox.tool.scheduler.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * 定时任务调度模块线程池配置（NFR-3 执行隔离 / NFR-6 并发上限）。
 *
 * <p>三个线程池职责独立、互不阻塞：
 * <ul>
 *   <li>{@code schedulerTaskScheduler}（poolSize=2）：仅负责 cron 触发，不执行任务本身</li>
 *   <li>{@code schedulerTaskExecutor}（10/10）：任务执行，并发上限即 NFR-6 的可配上限，
 *       队列无界——超出的执行请求排队等待而非丢弃</li>
 *   <li>{@code schedulerNotifyExecutor}（core=2）：Webhook/邮件通知异步发送，不阻塞执行结果记录</li>
 * </ul>
 *
 * <p>{@code @EnableAsync} 与主应用类（MiaoToolboxApiApplication）重复声明，幂等；
 * 此处声明使本模块线程池配置自包含。
 */
@Configuration
@EnableAsync
public class SchedulerConfig {

    /** 调度线程池：仅触发（NFR-3），poolSize=2 足够 */
    @Bean(name = "schedulerTaskScheduler")
    public ThreadPoolTaskScheduler schedulerTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("scheduler-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(30);
        return scheduler;
    }

    /** 任务执行线程池：并发上限 10（NFR-6 默认），队列无界排队 */
    @Bean(name = "schedulerTaskExecutor")
    public ThreadPoolTaskExecutor schedulerTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(Integer.MAX_VALUE);
        executor.setThreadNamePrefix("task-exec-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        executor.initialize();
        return executor;
    }

    /** 通知线程池：Webhook/邮件异步发送，失败不重试 */
    @Bean(name = "schedulerNotifyExecutor")
    public ThreadPoolTaskExecutor schedulerNotifyExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(1000);
        executor.setThreadNamePrefix("notify-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
