package com.miao.toolbox.tool.scheduler.repository;

import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TaskExecutionRepository JPA 切片测试（AC1/AC2）。
 *
 * <p>验证执行记录 CRUD、JSON 摘要列持久化、任务删除时 DB 级联删除执行记录
 * （fk_task_exec_tasks ON DELETE CASCADE）与留存清理删除方法。
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@DisplayName("TaskExecutionRepository 执行记录持久化")
class TaskExecutionRepositoryTest {

    @Autowired
    private TaskExecutionRepository executionRepository;

    @Autowired
    private ScheduledTaskRepository taskRepository;

    @Autowired
    private EntityManager entityManager;

    private ScheduledTask newTask(String name) {
        return taskRepository.save(ScheduledTask.builder()
                .name(name)
                .targetType(TargetType.HTTP)
                .targetConfig(HttpTargetConfig.builder().method("GET").url("https://example.com").build())
                .cronExpression("* * * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(30)
                .build());
    }

    private TaskExecution newExecution(Long taskId, LocalDateTime triggeredAt, ExecutionStatus status) {
        return TaskExecution.builder()
                .taskId(taskId)
                .triggerType(TriggerType.SCHEDULED)
                .triggeredAt(triggeredAt)
                .startedAt(triggeredAt)
                .finishedAt(triggeredAt.plusSeconds(1))
                .durationMs(1000)
                .status(status)
                .retryCount(0)
                .requestSummary("{\"method\":\"GET\",\"url\":\"https://example.com\"}")
                .responseSummary("{\"statusCode\":200,\"truncated\":false}")
                .errorMessage(status == ExecutionStatus.FAILED ? "连接超时" : null)
                .build();
    }

    @DisplayName("AC2: 执行记录 CRUD + JSON 摘要列 + 枚举往返")
    @Test
    void saveAndLoadExecution() {
        ScheduledTask task = newTask("执行记录测试任务");
        TaskExecution execution = executionRepository.saveAndFlush(
                newExecution(task.getId(), LocalDateTime.now().withNano(0), ExecutionStatus.SUCCESS));

        entityManager.clear();
        TaskExecution loaded = executionRepository.findById(execution.getId()).orElseThrow();

        assertThat(loaded.getTaskId()).isEqualTo(task.getId());
        assertThat(loaded.getTriggerType()).isEqualTo(TriggerType.SCHEDULED);
        assertThat(loaded.getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(loaded.getDurationMs()).isEqualTo(1000);
        assertThat(loaded.getRequestSummary()).contains("\"method\":\"GET\"");
        assertThat(loaded.getResponseSummary()).contains("\"statusCode\":200");
        assertThat(loaded.getErrorMessage()).isNull();
    }

    @DisplayName("AC1: 删除任务时按 taskId 清除执行记录（JPA 层删除 + 生产 DB FK CASCADE 兜底）")
    @Test
    void deleteByTaskIdRemovesExecutions() {
        ScheduledTask task = newTask("级联删除测试任务");
        LocalDateTime base = LocalDateTime.now().withNano(0);
        executionRepository.saveAndFlush(newExecution(task.getId(), base, ExecutionStatus.SUCCESS));
        executionRepository.saveAndFlush(newExecution(task.getId(), base.plusMinutes(5), ExecutionStatus.FAILED));
        assertThat(executionRepository.findByTaskIdOrderByTriggeredAtDesc(task.getId(), PageRequest.of(0, 10)))
                .hasSize(2);

        long deleted = executionRepository.deleteByTaskId(task.getId());
        executionRepository.flush();
        entityManager.clear();

        assertThat(deleted).isEqualTo(2);
        assertThat(executionRepository.findByTaskIdOrderByTriggeredAtDesc(task.getId(), PageRequest.of(0, 10)))
                .isEmpty();
    }

    @DisplayName("FR-9: 执行历史分页按触发时间倒序")
    @Test
    void pagedHistoryOrderedByTriggeredAtDesc() {
        ScheduledTask task = newTask("分页测试任务");
        LocalDateTime base = LocalDateTime.now().withNano(0);
        for (int i = 0; i < 5; i++) {
            executionRepository.saveAndFlush(newExecution(task.getId(), base.plusMinutes(i), ExecutionStatus.SUCCESS));
        }
        entityManager.clear();

        Page<TaskExecution> page = executionRepository.findByTaskIdOrderByTriggeredAtDesc(
                task.getId(), PageRequest.of(0, 3));

        assertThat(page.getTotalElements()).isEqualTo(5);
        assertThat(page.getContent()).hasSize(3);
        List<LocalDateTime> triggeredAts = page.getContent().stream()
                .map(TaskExecution::getTriggeredAt).toList();
        assertThat(triggeredAts).isSortedAccordingTo(java.util.Comparator.reverseOrder());
    }

    @DisplayName("FR-8: deleteByTriggeredAtBefore 留存清理（只删指定时间前）")
    @Test
    void deleteByTriggeredAtBefore() {
        ScheduledTask task = newTask("留存清理测试任务");
        LocalDateTime base = LocalDateTime.now().withNano(0);
        executionRepository.saveAndFlush(newExecution(task.getId(), base.minusDays(40), ExecutionStatus.SUCCESS));
        executionRepository.saveAndFlush(newExecution(task.getId(), base.minusDays(10), ExecutionStatus.SUCCESS));
        executionRepository.saveAndFlush(newExecution(task.getId(), base, ExecutionStatus.SUCCESS));

        long deleted = executionRepository.deleteByTriggeredAtBefore(base.minusDays(30));
        executionRepository.flush();

        assertThat(deleted).isEqualTo(1);
        assertThat(executionRepository.findByTaskIdOrderByTriggeredAtDesc(task.getId(), PageRequest.of(0, 10)))
                .hasSize(2);
    }

    @DisplayName("AC2: SKIPPED 记录 startedAt/finishedAt 为空语义")
    @Test
    void skippedExecutionNullableTimestamps() {
        ScheduledTask task = newTask("跳过记录测试任务");
        TaskExecution skipped = TaskExecution.builder()
                .taskId(task.getId())
                .triggerType(TriggerType.SCHEDULED)
                .triggeredAt(LocalDateTime.now().withNano(0))
                .startedAt(null)
                .finishedAt(null)
                .durationMs(null)
                .status(ExecutionStatus.SKIPPED)
                .retryCount(0)
                .build();
        TaskExecution saved = executionRepository.saveAndFlush(skipped);

        entityManager.clear();
        TaskExecution loaded = executionRepository.findById(saved.getId()).orElseThrow();

        assertThat(loaded.getStatus()).isEqualTo(ExecutionStatus.SKIPPED);
        assertThat(loaded.getStartedAt()).isNull();
        assertThat(loaded.getFinishedAt()).isNull();
        assertThat(loaded.getDurationMs()).isNull();
    }
}
