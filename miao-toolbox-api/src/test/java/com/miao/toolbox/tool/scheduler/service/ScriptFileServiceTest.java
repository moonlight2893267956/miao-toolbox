package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("ScriptFileService 脚本物化")
class ScriptFileServiceTest {

    @TempDir
    Path tempDir;

    private ScriptFileService service() {
        return new ScriptFileService(tempDir.toString());
    }

    @DisplayName("物化路径为 {upload-dir}/{scriptId}/v{version}.{ext}")
    @Test
    void materializeUsesScriptIdAndVersionPath() throws Exception {
        Path file = service().materialize(42L, 3, ScriptType.SHELL, "echo hi");

        assertThat(file).isEqualTo(tempDir.resolve("42").resolve("v3.sh"));
        assertThat(Files.readString(file, StandardCharsets.UTF_8)).isEqualTo("echo hi");
    }

    @DisplayName("Python 脚本扩展名为 .py")
    @Test
    void pythonExtension() {
        Path file = service().materialize(7L, 1, ScriptType.PYTHON, "print(1)");
        assertThat(file.getFileName().toString()).isEqualTo("v1.py");
    }

    @DisplayName("物化幂等：同版本重复写入覆盖为最新内容")
    @Test
    void materializeIsIdempotent() throws Exception {
        ScriptFileService service = service();
        Path first = service.materialize(1L, 1, ScriptType.SHELL, "echo v1");
        Path second = service.materialize(1L, 1, ScriptType.SHELL, "echo v1-updated");

        assertThat(second).isEqualTo(first);
        assertThat(Files.readString(second, StandardCharsets.UTF_8)).isEqualTo("echo v1-updated");
        assertThat(Files.list(tempDir.resolve("1")).count()).isEqualTo(1);
    }

    @DisplayName("工作目录为 {upload-dir}/{scriptId}/")
    @Test
    void workDir() {
        assertThat(service().workDir(9L)).isEqualTo(tempDir.resolve("9"));
    }
}
