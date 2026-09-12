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
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * 脚本执行器（PRD FR-6/FR-14，架构 AR-4/AR-6/AR-7/AR-8）——宿主机子进程执行用户脚本。
 *
 * <p>执行链路：DB 取脚本版本内容 → 物化到白名单目录 → {@link ProcessBuilder} 起子进程
 * （Shell 用 {@code bash}，Python 用 {@code python3}）→ 参数经环境变量注入 → 等待/超时 →
 * 捕获 stdout/stderr。
 *
 * <p><b>参数注入（AR-6）</b>：走环境变量 {@code SCRIPT_PARAM_{NAME}}，不做命令行拼接，
 * 避免注入。NAME 由参数名转换而来（camelCase → 大写下划线，如 {@code retentionDays}
 * → {@code SCRIPT_PARAM_RETENTION_DAYS}）。
 *
 * <p><b>超时终止（AR-7）</b>：{@code waitFor(timeout)} 后先杀子进程树（{@code descendants}）
 * 再 {@code destroyForcibly()}，防僵尸进程。
 *
 * <p><b>输出捕获（AR-8）</b>：stdout/stderr 各由独立线程读取，避免管道写满导致子进程阻塞；
 * 各截断 4KB 并标注 {@code truncated}。
 *
 * <p><b>契约</b>：内部消化全部异常，只返回 {@link ExecutionResult}，绝不向执行线程抛出。
 */
@Slf4j
@Component
public class ScriptTaskExecutor implements TaskExecutor {

    /** stdout / stderr 各自保留上限（PRD FR-6：各截断 4KB） */
    static final int MAX_OUTPUT_BYTES = 4 * 1024;
    private static final int DEFAULT_TIMEOUT_SECONDS = 60;
    private static final int MAX_TIMEOUT_SECONDS = 600;
    /** 子进程退出后等待输出线程收尾的上限（孙进程可能仍持有管道） */
    private static final long STREAM_DRAIN_MILLIS = 2000;
    private static final String SHELL_COMMAND = "bash";
    private static final String PYTHON_COMMAND = "python3";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ScriptRepository scriptRepository;
    private final ScriptVersionRepository scriptVersionRepository;
    private final ScriptFileService scriptFileService;

    public ScriptTaskExecutor(ScriptRepository scriptRepository,
                              ScriptVersionRepository scriptVersionRepository,
                              ScriptFileService scriptFileService) {
        this.scriptRepository = scriptRepository;
        this.scriptVersionRepository = scriptVersionRepository;
        this.scriptFileService = scriptFileService;
    }

    @Override
    public ExecutionResult execute(ScheduledTask task) {
        String requestSummary = null;
        try {
            Map<String, Object> params = parseParams(task.getParams());
            requestSummary = MAPPER.writeValueAsString(Map.of("params", params));

            Script script = task.getScriptId() == null ? null
                    : scriptRepository.findById(task.getScriptId()).orElse(null);
            if (script == null) {
                return fail(requestSummary, "脚本不存在: " + task.getScriptId());
            }
            if (task.getScriptVersion() == null) {
                return fail(requestSummary, "任务未绑定脚本版本");
            }
            ScriptVersion version = scriptVersionRepository
                    .findByScriptIdAndVersion(task.getScriptId(), task.getScriptVersion())
                    .orElse(null);
            if (version == null) {
                return fail(requestSummary, "脚本版本不存在: " + task.getScriptId()
                        + " v" + task.getScriptVersion());
            }

            Path workDir = scriptFileService.workDir(task.getScriptId());
            Path scriptFile = scriptFileService.materialize(
                    task.getScriptId(), task.getScriptVersion(), script.getScriptType(), version.getContent());

            return run(task, script.getScriptType(), scriptFile, workDir, params, requestSummary);
        } catch (Exception e) {
            // 契约：绝不向上抛（调度线程异常会让 ThreadPoolTaskScheduler 静默停摆）
            log.warn("[task:{}] script execution aborted: {}", task.getId(), e.getMessage());
            return fail(requestSummary, "脚本执行异常: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------
    // 子进程执行
    // ------------------------------------------------------------

    private ExecutionResult run(ScheduledTask task, ScriptType type, Path scriptFile, Path workDir,
                                Map<String, Object> params, String requestSummary) throws IOException, InterruptedException {
        List<String> command = List.of(command(type), scriptFile.toString());
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(workDir.toFile());

        Map<String, String> paramEnv = toParamEnv(params);
        builder.environment().putAll(paramEnv);
        // 记录注入的变量名（不记录值，可能含敏感信息）：脚本里取不到值时可直接对照此处
        log.info("[task:{}] injected script params: {}", task.getId(), paramEnv.keySet());

        int timeoutSeconds = normalizeTimeout(task.getTimeoutSeconds());
        Process process = builder.start();
        StreamCollector stdout = new StreamCollector(process.getInputStream());
        StreamCollector stderr = new StreamCollector(process.getErrorStream());
        Thread stdoutThread = new Thread(stdout, "script-stdout-" + task.getId());
        Thread stderrThread = new Thread(stderr, "script-stderr-" + task.getId());
        stdoutThread.start();
        stderrThread.start();

        boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
        if (!finished) {
            log.warn("[task:{}] script timed out after {}s, killing process tree", task.getId(), timeoutSeconds);
            killProcessTree(process);
            awaitQuietly(process, stdoutThread, stderrThread);
            return ExecutionResult.of(ExecutionStatus.TIMEOUT, requestSummary,
                    responseSummary(-1, stdout.text(), stderr.text(), stdout.truncated() || stderr.truncated()),
                    "执行超时（" + timeoutSeconds + " 秒）");
        }

        stdoutThread.join(STREAM_DRAIN_MILLIS);
        stderrThread.join(STREAM_DRAIN_MILLIS);

        int exitCode = process.exitValue();
        String out = stdout.text();
        String err = stderr.text();
        boolean truncated = stdout.truncated() || stderr.truncated();
        ExecutionStatus status = exitCode == 0 ? ExecutionStatus.SUCCESS : ExecutionStatus.FAILED;
        String errorMessage = exitCode == 0 ? null : failureMessage(exitCode, err);

        log.info("[task:{}] script exited code={} stdoutBytes={} stderrBytes={} truncated={}",
                task.getId(), exitCode, out.length(), err.length(), truncated);
        return ExecutionResult.of(status, requestSummary,
                responseSummary(exitCode, out, err, truncated), errorMessage);
    }

    private String command(ScriptType type) {
        return type == ScriptType.PYTHON ? PYTHON_COMMAND : SHELL_COMMAND;
    }

    private String failureMessage(int exitCode, String stderr) {
        if (stderr == null || stderr.isBlank()) {
            return "退出码 " + exitCode;
        }
        String firstLine = stderr.strip().lines().findFirst().orElse("").trim();
        return firstLine.isEmpty() ? "退出码 " + exitCode : "退出码 " + exitCode + "：" + firstLine;
    }

    /** 超时终止：先终止子进程树，再强杀主进程（AR-7）。 */
    private void killProcessTree(Process process) {
        process.descendants().forEach(ProcessHandle::destroy);
        process.destroy();
        try {
            if (!process.waitFor(2, TimeUnit.SECONDS)) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }

    private void awaitQuietly(Process process, Thread stdoutThread, Thread stderrThread) {
        try {
            process.waitFor(2, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        try {
            stdoutThread.join(STREAM_DRAIN_MILLIS);
            stderrThread.join(STREAM_DRAIN_MILLIS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private int normalizeTimeout(Integer timeoutSeconds) {
        if (timeoutSeconds == null) {
            return DEFAULT_TIMEOUT_SECONDS;
        }
        return Math.min(Math.max(timeoutSeconds, 1), MAX_TIMEOUT_SECONDS);
    }

    // ------------------------------------------------------------
    // 参数 / 摘要
    // ------------------------------------------------------------

    private Map<String, Object> parseParams(String paramsJson) throws IOException {
        if (paramsJson == null || paramsJson.isBlank()) {
            return Map.of();
        }
        try {
            return MAPPER.readValue(paramsJson, new TypeReference<Map<String, Object>>() {
            });
        } catch (IOException e) {
            // 参数是 JSON 对象契约；格式非法时宁可失败也不静默按「无参数」执行
            throw new IOException("参数格式非法（需为 JSON 对象）：" + e.getMessage(), e);
        }
    }

    private Map<String, String> toParamEnv(Map<String, Object> params) {
        Map<String, String> env = new LinkedHashMap<>();
        params.forEach((name, value) -> {
            if (name == null || name.isBlank()) {
                return;
            }
            env.put(paramEnvName(name), value == null ? "" : String.valueOf(value));
        });
        return env;
    }

    /**
     * 参数名 → 环境变量名：前缀 {@code SCRIPT_PARAM_} + 大写下划线。
     * camelCase 在词边界插下划线（{@code retentionDays} → {@code SCRIPT_PARAM_RETENTION_DAYS}），
     * 非字母数字字符归一为下划线并合并连续下划线。
     */
    static String paramEnvName(String name) {
        StringBuilder sb = new StringBuilder("SCRIPT_PARAM_");
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            boolean boundary = Character.isUpperCase(c) && i > 0
                    && (Character.isLowerCase(name.charAt(i - 1)) || Character.isDigit(name.charAt(i - 1)));
            if (boundary && sb.charAt(sb.length() - 1) != '_') {
                sb.append('_');
            }
            if (Character.isLetterOrDigit(c)) {
                sb.append(Character.toUpperCase(c));
            } else if (sb.charAt(sb.length() - 1) != '_') {
                sb.append('_');
            }
        }
        while (sb.length() > 0 && sb.charAt(sb.length() - 1) == '_') {
            sb.deleteCharAt(sb.length() - 1);
        }
        return sb.toString();
    }

    private String responseSummary(int exitCode, String stdout, String stderr, boolean truncated) throws IOException {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("exitCode", exitCode);
        summary.put("stdout", stdout);
        summary.put("stderr", stderr);
        summary.put("truncated", truncated);
        return MAPPER.writeValueAsString(summary);
    }

    private ExecutionResult fail(String requestSummary, String message) {
        return ExecutionResult.of(ExecutionStatus.FAILED, requestSummary, null, message);
    }

    /**
     * 单流读取线程：持续读取以防子进程因管道写满而阻塞，同时只保留前 {@link #MAX_OUTPUT_BYTES} 字节。
     */
    private static final class StreamCollector implements Runnable {

        private final InputStream input;
        private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        private boolean truncated;

        StreamCollector(InputStream input) {
            this.input = input;
        }

        @Override
        public void run() {
            byte[] chunk = new byte[4096];
            try (InputStream in = input) {
                int read;
                while ((read = in.read(chunk)) != -1) {
                    append(chunk, read);
                }
            } catch (IOException e) {
                // 进程被强杀 / 管道关闭：属预期路径，仅保留已读内容
            }
        }

        private synchronized void append(byte[] chunk, int length) {
            int remaining = MAX_OUTPUT_BYTES - buffer.size();
            if (remaining <= 0) {
                truncated = true;
                return;
            }
            int toWrite = Math.min(length, remaining);
            buffer.write(chunk, 0, toWrite);
            if (toWrite < length) {
                truncated = true;
            }
        }

        synchronized String text() {
            return buffer.toString(StandardCharsets.UTF_8);
        }

        synchronized boolean truncated() {
            return truncated;
        }
    }
}
