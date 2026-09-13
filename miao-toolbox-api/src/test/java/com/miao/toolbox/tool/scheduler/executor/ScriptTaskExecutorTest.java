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
        stubScript(ScriptType.SHELL, "echo ok");
        ExecutionResult result = executor.execute(task("not-a-json", 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.FAILED);
        assertThat(result.errorMessage()).contains("参数格式非法");
    }

    // ------------------------------------------------------------
    // 环境变量隔离（防平台密钥泄漏）
    // ------------------------------------------------------------

    /** 允许出现在脚本进程中的环境变量名（与 ScriptTaskExecutor.ENV_ALLOWLIST 对应） */
    private static final java.util.Set<String> ALLOWED_ENV = java.util.Set.of(
            "PATH", "LANG", "LC_ALL", "LANGUAGE", "TZ", "HOME",
            "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY",
            "http_proxy", "https_proxy", "no_proxy", "all_proxy");

    /** bash 自行合成/导出的变量（非父进程传入，不含信息量） */
    private static final java.util.Set<String> SHELL_SYNTHESIZED =
            java.util.Set.of("PWD", "SHLVL", "OLDPWD", "_");

    /** 受控密钥环境变量名：以 MITM 方式注入，用于确认它不会进入脚本进程 */
    private static final String CONTROLLED_SECRET_ENV = "MIAO_TEST_SECRET";

    @DisplayName("注入一个受控密钥到 API 进程 → 脚本进程读不到（回归防线）")
    @Test
    void controlledParentSecretDoesNotReachScript() throws Exception {
        // 通过 `MIAO_TEST_SECRET=xxx mvn test` 注入；未注入时跳过
        String secretValue = System.getenv(CONTROLLED_SECRET_ENV);
        Assumptions.assumeTrue(secretValue != null && !secretValue.isBlank(),
                "未注入 " + CONTROLLED_SECRET_ENV + "，跳过该用例");

        // 打印该变量及其值（若泄漏会直接体现在 stdout）
        stubScript(ScriptType.SHELL, "echo \"leaked=[${" + CONTROLLED_SECRET_ENV + "}]\"");
        ExecutionResult result = executor.execute(task(null, 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.SUCCESS);
        String stdout = (String) response(result).get("stdout");
        assertThat(stdout).contains("leaked=[]");
        assertThat(stdout).doesNotContain(secretValue);
    }

    @DisplayName("脚本进程只拿到白名单环境变量——API 进程的其他变量（含密钥）不泄漏")
    @Test
    void scriptEnvIsWhitelistOnly() throws Exception {
        // compgen -e 为 bash 内建，逐行列出环境变量名，不依赖外部命令
        stubScript(ScriptType.SHELL, "compgen -e");
        ExecutionResult result = executor.execute(task(null, 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.SUCCESS);
        String stdout = (String) response(result).get("stdout");
        java.util.Set<String> parentKeys = System.getenv().keySet();
        // 只关心「确实来自父进程」且不在白名单里的变量——这才是泄漏
        java.util.List<String> leaked = stdout.lines()
                .map(String::strip)
                .filter(parentKeys::contains)
                .filter(name -> !ALLOWED_ENV.contains(name))
                .filter(name -> !SHELL_SYNTHESIZED.contains(name))
                .filter(name -> !name.startsWith("SCRIPT_PARAM_"))
                .toList();

        assertThat(leaked)
                .as("脚本进程出现了白名单外的父进程环境变量（平台密钥会随之泄漏）")
                .isEmpty();
    }

    @DisplayName("HOME 指向脚本工作目录且 PATH 可用——脚本写 $HOME 被限制在工作目录内")
    @Test
    void scriptHomeIsWorkDirAndPathWorks() throws Exception {        stubScript(ScriptType.SHELL, "echo \"HOME=$HOME\"; command -v bash >/dev/null && echo BASH_OK");
        ExecutionResult result = executor.execute(task(null, 30));

        assertThat(result.status()).isEqualTo(ExecutionStatus.SUCCESS);
        String stdout = (String) response(result).get("stdout");
        // 工作目录 = {upload-dir}/{scriptId}/，脚本 HOME 与之相同（scriptId 固定为 1）
        assertThat(stdout).contains("HOME=" + tempDir.resolve("1"));
        assertThat(stdout).contains("BASH_OK");
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
