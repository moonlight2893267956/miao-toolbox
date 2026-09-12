package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 脚本文件物化（PRD FR-14 / 架构 AR-4/AR-5）。
 *
 * <p>脚本内容存 DB，执行前写入白名单目录 {@code {upload-dir}/{scriptId}/v{version}.{ext}}，
 * 并以 {@code {upload-dir}/{scriptId}/} 作为执行工作目录（脚本内相对路径操作被限制在此）。
 *
 * <p><b>路径穿越防护</b>：路径片段全部由服务端拼接——{@code scriptId} 是自增 BIGINT、
 * {@code version} 是自增 INT、扩展名来自 {@link ScriptType} 枚举，均不接受用户输入。
 *
 * <p>物化幂等：同版本重复写入直接覆盖（内容一致）。
 */
@Service
public class ScriptFileService {

    private final Path uploadDir;

    public ScriptFileService(@Value("${scheduler.script.upload-dir}") String uploadDir) {
        this.uploadDir = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    /** 脚本工作目录：{upload-dir}/{scriptId}/ */
    public Path workDir(Long scriptId) {
        return uploadDir.resolve(String.valueOf(scriptId));
    }

    /**
     * 将脚本内容落盘为可执行文件。
     *
     * @return 物化后的脚本文件绝对路径
     */
    public Path materialize(Long scriptId, Integer version, ScriptType type, String content) {
        Path dir = workDir(scriptId);
        Path file = dir.resolve("v" + version + extension(type));
        try {
            Files.createDirectories(dir);
            Files.writeString(file, content, StandardCharsets.UTF_8);
            return file;
        } catch (IOException e) {
            throw new UncheckedIOException("脚本物化失败：" + file, e);
        }
    }

    /** 白名单根目录（诊断/日志用）。 */
    public Path uploadDir() {
        return uploadDir;
    }

    private String extension(ScriptType type) {
        return type == ScriptType.PYTHON ? ".py" : ".sh";
    }
}
