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
 * <p>第三个用例验证懒加载语义：任务 params 为空（未显式覆盖）、脚本声明了默认值时，
 * 执行自动取脚本声明的最新默认值——改脚本默认值即影响任务，无需重新编辑任务。
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
     * @param taskParams 任务保存的参数快照 JSON（可为 null，模拟「任务里没显式覆盖参数」）
     * @param paramSchema 脚本参数声明 JSON（默认值随声明走，任务未覆盖时执行取此值）
     */
    private Long createScriptAndTask(Path outputFile, String taskParams, String paramSchema) {
        Script script = scriptRepository.save(Script.builder()
                .name("参数注入验证-" + System.nanoTime())
                .scriptType(ScriptType.SHELL)
                .latestVersion(1)
                .paramSchema(paramSchema)
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

    /**
     * 异步执行：轮询执行记录落库，拿到本次执行结果。
     *
     * @param afterId 上一次已知执行记录 id（同一任务多次触发时，只认 id 更大的新记录）
     */
    private TaskExecution awaitExecution(Long taskId, long afterId) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 30_000;
        while (System.currentTimeMillis() < deadline) {
            List<TaskExecution> records = executionRepository.findAll().stream()
                    .filter(e -> taskId.equals(e.getTaskId()) && e.getId() > afterId)
                    .toList();
            if (!records.isEmpty()) {
                return records.stream()
                        .max(Comparator.comparing(TaskExecution::getId))
                        .orElseThrow();
            }
            Thread.sleep(200);
        }
        fail("执行记录未在 30s 内落库（taskId=" + taskId + ", afterId=" + afterId + "）");
        return null;
    }

    private String readOutput(Path outputFile) throws Exception {
        return Files.exists(outputFile) ? Files.readString(outputFile, StandardCharsets.UTF_8) : "<文件未创建>";
    }

    @Test
    @DisplayName("任务显式覆盖了参数值 → 脚本内 SCRIPT_PARAM_DATA 取到任务值并落盘")
    void savedParamsAreInjectedIntoScript() throws Exception {
        Path outputFile = outputDir.resolve("with-params.txt");
        Long taskId = createScriptAndTask(outputFile, "{\"data\":\"任务值\"}",
                "[{\"name\":\"data\",\"type\":\"string\",\"default\":\"脚本默认\"}]");

        executionEngine.triggerManual(taskId);
        TaskExecution execution = awaitExecution(taskId, 0);

        assertThat(execution.getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(execution.getRequestSummary()).contains("任务值");
        assertThat(readOutput(outputFile).strip()).isEqualTo("任务值");
    }

    @Test
    @DisplayName("任务 params 为空且声明无默认值 → 执行成功但写出空值")
    void emptyTaskParamsProduceEmptyOutput() throws Exception {
        Path outputFile = outputDir.resolve("without-params.txt");
        Long taskId = createScriptAndTask(outputFile, null,
                "[{\"name\":\"data\",\"type\":\"string\"}]");

        executionEngine.triggerManual(taskId);
        TaskExecution execution = awaitExecution(taskId, 0);

        // 执行链路完全正常（脚本退出码 0），只是无值可注入 → ${VAR} 展开为空
        assertThat(execution.getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(readOutput(outputFile).strip()).isEmpty();
    }

    @Test
    @DisplayName("懒加载：任务未显式覆盖 → 执行取脚本声明的默认值；改默认值后旧任务自动跟随")
    void lazyDefaultFollowsScriptSchemaChange() throws Exception {
        Path outputFile = outputDir.resolve("lazy-default.txt");
        String schemaV1 = "[{\"name\":\"data\",\"type\":\"string\",\"default\":\"默认值V1\"}]";
        // 模拟前端懒加载保存策略：等于默认值的参数不固化进任务 params
        Long taskId = createScriptAndTask(outputFile, null, schemaV1);

        // 第一次执行：任务未覆盖 → 取脚本默认值「默认值V1」
        executionEngine.triggerManual(taskId);
        TaskExecution first = awaitExecution(taskId, 0);
        assertThat(first.getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(readOutput(outputFile).strip()).isEqualTo("默认值V1");

        // 清空输出文件，模拟下次执行
        Files.deleteIfExists(outputFile);

        // 管理员只改脚本参数声明的默认值（任务不动）——懒加载语义下应自动跟随
        Script script = scriptRepository.findAll().stream()
                .filter(s -> taskId != null && s.getId().equals(
                        taskRepository.findById(taskId).orElseThrow().getScriptId()))
                .findFirst().orElseThrow();
        script.setParamSchema("[{\"name\":\"data\",\"type\":\"string\",\"default\":\"默认值V2\"}]");
        scriptRepository.save(script);

        executionEngine.triggerManual(taskId);
        TaskExecution second = awaitExecution(taskId, first.getId());
        assertThat(second.getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        // 关键断言：任务从未编辑，但取到了脚本改后的最新默认值
        assertThat(readOutput(outputFile).strip()).isEqualTo("默认值V2");
    }

    @Test
    @DisplayName("懒加载 + 显式覆盖共存：覆盖值优先于脚本默认值")
    void overrideWinsOverLazyDefault() throws Exception {
        Path outputFile = outputDir.resolve("override-wins.txt");
        Long taskId = createScriptAndTask(outputFile, "{\"data\":\"显式覆盖\"}",
                "[{\"name\":\"data\",\"type\":\"string\",\"default\":\"脚本默认\"}]");

        executionEngine.triggerManual(taskId);
        TaskExecution execution = awaitExecution(taskId, 0);

        assertThat(execution.getStatus()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(readOutput(outputFile).strip()).isEqualTo("显式覆盖");
    }
}
