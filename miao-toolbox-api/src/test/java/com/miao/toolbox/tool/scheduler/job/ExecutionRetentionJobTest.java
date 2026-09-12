package com.miao.toolbox.tool.scheduler.job;

import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.Script;
import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptRepository;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 执行记录留存清理（FR-9 / Story 3.4）。
 *
 * <p>覆盖两条清理规则（按时间、按每任务条数）与「清理失败不影响主流程」的失败隔离。
 */
@DataJpaTest
@ActiveProfiles("test")
@DisplayName("执行记录留存清理")
class ExecutionRetentionJobTest {

    @Autowired
    private TaskExecutionRepository executionRepository;

    @Autowired
    private ScheduledTaskRepository taskRepository;

    @Autowired
    private ScriptRepository scriptRepository;

    private Long taskId;

    @BeforeEach
    void setUp() {
        Script script = scriptRepository.save(Script.builder()
                .name("留存清理测试")
                .scriptType(ScriptType.SHELL)
                .latestVersion(1)
                .build());
        taskId = taskRepository.save(ScheduledTask.builder()
                .name("留存清理任务")
                .scriptId(script.getId())
                .scriptVersion(1)
                .cronExpression("0 0 3 * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(60)
                .build()).getId();
    }

    private TaskExecution execution(LocalDateTime triggeredAt) {
        return TaskExecution.builder()
                .taskId(taskId)
                .triggerType(TriggerType.SCHEDULED)
                .triggeredAt(triggeredAt)
                .startedAt(triggeredAt)
                .finishedAt(triggeredAt)
                .durationMs(1)
                .status(ExecutionStatus.SUCCESS)
                .retryCount(0)
                .build();
    }

    /** 配置走 @Value 注入，测试中直接写字段（默认 30 天 / 100 条过小不便构造） */
    private ExecutionRetentionJob job(int retentionDays, int keepPerTask) {
        ExecutionRetentionJob job = new ExecutionRetentionJob(executionRepository);
        ReflectionTestUtils.setField(job, "retentionDays", retentionDays);
        ReflectionTestUtils.setField(job, "keepPerTask", keepPerTask);
        return job;
    }

    private List<Long> sortedIds() {
        return executionRepository.findAll().stream()
                .map(TaskExecution::getId)
                .sorted()
                .toList();
    }

    @DisplayName("超过保留天数的记录被删除，近期记录保留")
    @Test
    void deletesByAge() {
        executionRepository.save(execution(LocalDateTime.now().minusDays(40)));
        executionRepository.save(execution(LocalDateTime.now().minusDays(1)));

        job(30, 100).cleanup();

        assertThat(executionRepository.findAll()).hasSize(1);
    }

    @DisplayName("每任务仅保留最近 N 条：删除的是最旧的，保留的是最新的")
    @Test
    void keepsLatestPerTask() {
        LocalDateTime base = LocalDateTime.now().minusMinutes(10);
        for (int i = 0; i < 5; i++) {
            executionRepository.save(execution(base.plusMinutes(i)));
        }
        List<Long> before = sortedIds();

        job(30, 2).cleanup();

        assertThat(sortedIds()).isEqualTo(before.subList(before.size() - 2, before.size()));
    }

    @DisplayName("记录数恰好等于保留条数时不删除（边界：防止 off-by-one 误删一条）")
    @Test
    void keepsAllWhenExactlyAtLimit() {
        executionRepository.save(execution(LocalDateTime.now().minusMinutes(3)));
        executionRepository.save(execution(LocalDateTime.now().minusMinutes(1)));

        job(30, 2).cleanup();

        assertThat(executionRepository.findAll()).hasSize(2);
    }

    @DisplayName("记录数未超过保留条数时不删除")
    @Test
    void noopWhenUnderLimit() {
        executionRepository.save(execution(LocalDateTime.now().minusMinutes(3)));
        executionRepository.save(execution(LocalDateTime.now().minusMinutes(1)));

        job(30, 100).cleanup();

        assertThat(executionRepository.findAll()).hasSize(2);
    }

    @DisplayName("清理异常被消化，不向上传播（不影响主流程）")
    @Test
    void swallowsException() {
        @SuppressWarnings("unchecked")
        TaskExecutionRepository failing = mock(TaskExecutionRepository.class);
        when(failing.deleteByTriggeredAtBefore(any())).thenThrow(new RuntimeException("db down"));

        ExecutionRetentionJob job = new ExecutionRetentionJob(failing);

        assertDoesNotThrow(() -> job.cleanup());
    }
}
