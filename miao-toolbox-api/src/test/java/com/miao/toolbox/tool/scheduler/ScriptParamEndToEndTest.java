package com.miao.toolbox.tool.scheduler;

import com.miao.toolbox.TestRedisConfig;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.Script;
import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import com.miao.toolbox.tool.scheduler.entity.ScriptVersion;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptVersionRepository;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import com.miao.toolbox.tool.scheduler.service.ExecutionEngine;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

/**
 * 脚本参数注入端到端测试（真实 Spring 容器 + 真实子进程 + 真实持久化）。
 *
 * <p>复现线上现象：脚本 {@code echo "${SCRIPT_PARAM_DATA}" >> out.txt}，任务里保存了
 * {@code {"data":"..."}}，执行后文件却只有空行。本测试覆盖完整链路：
 * 任务入库 → {@link ExecutionEngine#triggerManual} → 异步执行 → 读回 params →
 * 注入 {@code SCRIPT_PARAM_*} 环境变量 → bash 子进程 → 落盘。
 *
 * <p>第二个用例刻意复现「任务 params 为空」的情形——它证明：当任务入库时 params 为空，
 * 执行链路完全正常也会写出空值。这正是 PRD FR-2「参数 schema 变更不影响已绑定的任务
 * （任务执行时使用创建时绑定的参数值）」的必然结果，不是执行器缺陷。
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestRedisConfig.class)
@DisplayName("脚本参数端到端（真实子进程）")
class ScriptParamEndToEndTest {

    private static final String SCRIPT_TEMPLATE = "echo \"${SCRIPT_PARAM_DATA}\" >> '%s'\n";

    @Autowired
    private ScriptRepository scriptRepository;

    @Autowired
    private ScriptVersionRepository scriptVersionRepository;

    @Autowired
    private ScheduledTaskRepository taskRepository;

    @Autowired
    private TaskExecutionRepository executionRepository;

    @Autowired
    private ExecutionEngine executionEngine;

    @TempDir
    Path outputDir;

    @BeforeAll
    static void requireBash() {
        Assumptions.assumeTrue(commandAvailable("bash", "-c", "exit 0"), "宿主机无 bash，跳过");
    }

    private static boolean commandAvailable(String... command) {
        try {
            Process process = new ProcessBuilder(command).start();
            return process.waitFor(5, TimeUnit.SECONDS) && process.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 建脚本（含参数声明）+ 任务，返回任务 id。
     *
     * @param outputFile 脚本写入的目标文件
     * @param taskParams 任务保存的参数快照 JSON（可为 null，模拟「任务里没填参数」）
     */
    private Long createScriptAndTask(Path outputFile, String taskParams) {
        Script script = scriptRepository.save(Script.builder()
                .name("参数注入验证-" + System.nanoTime())
                .scriptType(ScriptType.SHELL)
                .latestVersion(1)
                .paramSchema("[{\"name\":\"data\",\"type\":\"string\"}]")
                .build());
        scriptVersionRepository.save(ScriptVersion.builder()
                .scriptId(script.getId())
                .version(1)
                .content(String.format(SCRIPT_TEMPLATE, outputFile))
                .build());

        return taskRepository.save(ScheduledTask.builder()
                .name("参数注入任务-" + System.nanoTime())
                .scriptId(script.getId())
                .scriptVersion(1)
                .params(taskParams)
                .cronExpression("0 0 3 * * *")
                .timezone("Asia/Shanghai")
                .status(TaskStatus.ENABLED)
                .retryCount(0)
                .retryInterval(60)
                .timeoutSeconds(60)
                .build()).getId();
    }

    /** 异步执行：轮询执行记录落库，拿到本次执行结果 */
    private TaskExecution awaitExecution(Long taskId) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 30_000;
        while (System.currentTimeMillis() < deadline) {
            List<TaskExecution> records = executionRepository.findAll().stream()
                    .filter(e -> taskId.equals(e.getTaskId()))
                    .toList();
            if (!records.isEmpty()) {
                return records.stream()
                        .max(Comparator.comparing(TaskExecution::getId))
                        .orElseThrow();
            }
            Thread.sleep(200);
        }
        fail("执行记录未在 30s 内落库（taskId=" + taskId + "）");
        return null;
    }

    private String readOutput(Path outputFile) throws Exception {
        return Files.exists(outputFile) ? Files.readString(outputFile, StandardCharsets.UTF_8) : "<文件未创建>";
    }

    @Test
    @DisplayName("任务保存了参数值 → 脚本内 SCRIPT_PARAM_DATA 取到该值并落盘")
    void savedParamsAreInjectedIntoScript() throws Exception {
        Path outputFile = outputDir.resolve("with-params.txt");
        Long taskId = createScriptAndTask(outputFile, "{\"data\":\"默认值\"}");

        executionEngine.triggerManual(taskId);
        TaskExecution execution = awaitExecution(taskId);

        assertThat(execution.getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(execution.getRequestSummary()).contains("默认值");
        assertThat(readOutput(outputFile).strip()).isEqualTo("默认值");
    }

    @Test
    @DisplayName("任务 params 为空 → 执行同样成功，但脚本写出空值（复现线上现象，非执行器缺陷）")
    void emptyTaskParamsProduceEmptyOutput() throws Exception {
        Path outputFile = outputDir.resolve("without-params.txt");
        Long taskId = createScriptAndTask(outputFile, null);

        executionEngine.triggerManual(taskId);
        TaskExecution execution = awaitExecution(taskId);

        // 执行链路完全正常（脚本退出码 0），只是环境变量不存在 → ${VAR} 展开为空
        assertThat(execution.getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(readOutput(outputFile).strip()).isEmpty();
    }
}
