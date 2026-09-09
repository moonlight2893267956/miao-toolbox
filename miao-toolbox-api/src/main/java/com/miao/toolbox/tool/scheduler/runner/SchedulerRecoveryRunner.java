package com.miao.toolbox.tool.scheduler.runner;

import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.service.SchedulerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 调度重启恢复（NFR-2）：应用启动后加载全部 ENABLED 任务重新注册调度。
 *
 * <p>v1 不补跑（missed-run）重启窗口内错过的任务——恢复后按下次 cron 时间继续
 * （PRD 明确声明）。单任务注册失败不阻断其他任务（register 内部已兜底，此处双保险）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SchedulerRecoveryRunner implements ApplicationRunner {

    private final ScheduledTaskRepository taskRepository;
    private final SchedulerService schedulerService;

    @Override
    public void run(ApplicationArguments args) {
        List<ScheduledTask> enabled = taskRepository.findByStatus(TaskStatus.ENABLED);
        int registered = 0;
        int failed = 0;
        for (ScheduledTask task : enabled) {
            try {
                if (schedulerService.register(task)) {
                    registered++;
                } else {
                    failed++;
                }
            } catch (Exception e) {
                failed++;
                log.error("[task:{}] recovery register failed: {}", task.getId(), e.getMessage());
            }
        }
        log.info("scheduler recovery: {} enabled tasks loaded, {} registered, {} failed",
                enabled.size(), registered, failed);
    }
}
