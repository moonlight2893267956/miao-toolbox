package com.miao.toolbox.tool.scheduler.executor;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.Script;
import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import com.miao.toolbox.tool.scheduler.entity.ScriptVersion;
import com.miao.toolbox.tool.scheduler.repository.ScriptRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptVersionRepository;
import com.miao.toolbox.tool.scheduler.service.ScriptFileService;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * 脚本执行器测试：真实起子进程（bash / python3）验证执行、参数注入、超时与输出捕获。
 *
 * <p>依赖宿主机存在 {@code bash}（Python 用例额外要求 {@code python3}）；
 * 缺失时用 {@link Assumptions} 跳过，避免在不具备条件的机器上误报失败。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ScriptTaskExecutor 脚本执行器")
class ScriptTaskExecutorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Mock
    private ScriptRepository scriptRepository;

    @Mock
    private ScriptVersionRepository scriptVersionRepository;

    @TempDir
    Path tempDir;

    private ScriptTaskExecutor executor;

    @BeforeAll
    static void requireBash() {
        Assumptions.assumeTrue(commandAvailable("bash", "-c", "exit 0"), "宿主机无 bash，跳过");
    }

    @BeforeEach
    void setUp() {
        executor = new ScriptTaskExecutor(scriptRepository, scriptVersionRepository,
                new ScriptFileService(tempDir.toString()));
    }

    private static boolean commandAvailable(String... command) {
        try {
            Process process = new ProcessBuilder(command).start();
            return process.waitFor(5, TimeUnit.SECONDS) && process.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private ScheduledTask task(String params, Integer timeoutSeconds) {
        return ScheduledTask.builder()
                .id(7L)
                .name("清理日志")
                .scriptId(1L)
                .scriptVersion(1)
                .params(params)
                .timeoutSeconds(timeoutSeconds)
                .build();
    }

    private void stubScript(ScriptType type, String content) {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(Script.builder()
                .id(1L).name("清理日志").scriptType(type).latestVersion(1).build()));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.of(
                ScriptVersion.builder().id(10L).scriptId(1L).version(1).content(content).build()));
    }

    private Map<String, Object> response(ExecutionResult result) throws Exception {
        assertThat(result.responseSummary()).isNotNull();
        return MAPPER.readValue(result.responseSummary(), new TypeReference<>() {
        });
    }

    // ------------------------------------------------------------
    // 正常执行
    // ------------------------------------------------------------

    @DisplayName("退出码 0 → SUCCESS，stdout 被捕获并写入摘要")
    @Test
    void successCapturesStdout() throws Exception {
        stubScript(ScriptType.SHELL, "echo hello-miao");

        ExecutionResult result = executor.execute(task(null, 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(result.errorMessage()).isNull();
        Map<String, Object> summary = response(result);
        assertThat(summary.get("exitCode")).isEqualTo(0);
        assertThat((String) summary.get("stdout")).contains("hello-miao");
        assertThat(summary.get("truncated")).isEqualTo(false);
    }

    @DisplayName("Python 脚本用 python3 执行")
    @Test
    void pythonScriptRuns() {
        Assumptions.assumeTrue(commandAvailable("python3", "-c", "print(1)"), "宿主机无 python3，跳过");
        stubScript(ScriptType.PYTHON, "import os\nprint('py-ok', os.environ.get('SCRIPT_PARAM_X'))\n");

        ExecutionResult result = executor.execute(task("{\"x\":\"1\"}", 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat(result.responseSummary()).contains("py-ok 1");
    }

    @DisplayName("非 0 退出码 → FAILED，错误信息含退出码与 stderr 首行")
    @Test
    void nonZeroExitFails() throws Exception {
        stubScript(ScriptType.SHELL, "echo 'disk full' >&2\nexit 3");

        ExecutionResult result = executor.execute(task(null, 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("退出码 3").contains("disk full");
        Map<String, Object> summary = response(result);
        assertThat(summary.get("exitCode")).isEqualTo(3);
        assertThat((String) summary.get("stderr")).contains("disk full");
    }

    // ------------------------------------------------------------
    // 参数注入（AR-6）
    // ------------------------------------------------------------

    @DisplayName("参数经环境变量注入：camelCase → SCRIPT_PARAM_XXX_YYY")
    @Test
    void paramsInjectedAsEnvVars() throws Exception {
        stubScript(ScriptType.SHELL, "echo \"days=${SCRIPT_PARAM_RETENTION_DAYS}\"");

        ExecutionResult result = executor.execute(task("{\"retentionDays\": 30}", 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.SUCCESS);
        assertThat((String) response(result).get("stdout")).contains("days=30");
    }

    @DisplayName("参数格式非法 → FAILED（不静默按无参数执行）")
    @Test
    void malformedParamsFail() {
        ExecutionResult result = executor.execute(task("not-a-json", 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("参数格式非法");
    }

    // ------------------------------------------------------------
    // 超时（AR-7）
    // ------------------------------------------------------------

    @DisplayName("超过超时时间 → TIMEOUT，且进程被终止")
    @Test
    void timeoutKillsProcess() throws Exception {
        stubScript(ScriptType.SHELL, "sleep 30");

        long start = System.currentTimeMillis();
        ExecutionResult result = executor.execute(task(null, 1));
        long elapsed = System.currentTimeMillis() - start;

        assertThat(result.status()).isEqualTo(ExecutionStatus.TIMEOUT);
        assertThat(result.errorMessage()).contains("超时");
        assertThat(elapsed).isLessThan(15_000); // 未等到 sleep 自然结束
        assertThat(response(result).get("exitCode")).isEqualTo(-1);
    }

    // ------------------------------------------------------------
    // 输出捕获（AR-8）
    // ------------------------------------------------------------

    @DisplayName("输出超过 4KB → 截断并标注 truncated")
    @Test
    void largeOutputIsTruncated() throws Exception {
        stubScript(ScriptType.SHELL, "head -c 6000 /dev/zero | tr '\\0' 'x'; echo");

        ExecutionResult result = executor.execute(task(null, 30));

        Map<String, Object> summary = response(result);
        assertThat(summary.get("truncated")).isEqualTo(true);
        assertThat(((String) summary.get("stdout")).getBytes(java.nio.charset.StandardCharsets.UTF_8).length)
                .isLessThanOrEqualTo(ScriptTaskExecutor.MAX_OUTPUT_BYTES);
    }

    @DisplayName("执行器消化异常：脚本记录缺失 → FAILED 而不抛出")
    @Test
    void missingScriptReturnsFailed() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.empty());

        ExecutionResult result = executor.execute(task(null, 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("脚本不存在");
    }

    @DisplayName("脚本版本缺失 → FAILED 并说明版本")
    @Test
    void missingVersionReturnsFailed() {
        when(scriptRepository.findById(1L)).thenReturn(Optional.of(Script.builder()
                .id(1L).name("清理日志").scriptType(ScriptType.SHELL).latestVersion(1).build()));
        when(scriptVersionRepository.findByScriptIdAndVersion(1L, 1)).thenReturn(Optional.empty());

        ExecutionResult result = executor.execute(task(null, 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("脚本版本不存在");
    }

    // ------------------------------------------------------------
    // 参数名转换（纯函数）
    // ------------------------------------------------------------

    @DisplayName("paramEnvName 转换规则（前端 format.ts paramEnvName 必须逐字符一致）")
    @Test
    void paramEnvNameCases() {
        assertThat(ScriptTaskExecutor.paramEnvName("data")).isEqualTo("SCRIPT_PARAM_DATA");
        assertThat(ScriptTaskExecutor.paramEnvName("retentionDays")).isEqualTo("SCRIPT_PARAM_RETENTION_DAYS");
        assertThat(ScriptTaskExecutor.paramEnvName("db_host")).isEqualTo("SCRIPT_PARAM_DB_HOST");
        assertThat(ScriptTaskExecutor.paramEnvName("maxRetry")).isEqualTo("SCRIPT_PARAM_MAX_RETRY");
        assertThat(ScriptTaskExecutor.paramEnvName("MAX")).isEqualTo("SCRIPT_PARAM_MAX");
        assertThat(ScriptTaskExecutor.paramEnvName("a-b c")).isEqualTo("SCRIPT_PARAM_A_B_C");
        assertThat(ScriptTaskExecutor.paramEnvName("_x_")).isEqualTo("SCRIPT_PARAM_X");
        assertThat(ScriptTaskExecutor.paramEnvName("")).isEqualTo("SCRIPT_PARAM");
    }
}
