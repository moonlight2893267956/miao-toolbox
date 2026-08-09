package com.miao.toolbox.storage.validator;

import com.miao.toolbox.storage.exception.StorageException;
import org.springframework.stereotype.Component;

/**
 * 文件名/目录名校验与消毒
 * <p>
 * 安全规则：
 * - 剥离 / \ .. 字符（替换为 _）
 * - 剥离前导 . （如 .bashrc → bashrc）
 * - 截断至 255 字符
 * - 允许中文和空格
 * - 清洗后为空字符串时返回验证错误
 */
@Component
public class FileNameValidator {

    private static final int MAX_NAME_LENGTH = 255;

    /**
     * 校验并清洗文件名
     *
     * @param fileName 原始文件名
     * @return 清洗后的安全文件名
     * @throws StorageException 文件名不合法时抛出
     */
    public String validate(String fileName) {
        return validate(fileName, "文件名");
    }

    /**
     * 校验并清洗目录名（单段目录名，不允许路径分隔符）
     *
     * @param dirName 原始目录名
     * @return 清洗后的安全目录名
     * @throws StorageException 目录名不合法时抛出
     */
    public String validateDirectoryName(String dirName) {
        return validate(dirName, "目录名");
    }

    /**
     * 校验目录路径（多级路径，如 "a/b/c"）。
     * <p>
     * 与单段目录名校验不同：路径中的 "/" 是合法的层级分隔符，不能被替换。
     * 仅拒绝路径遍历（..）、首尾斜杠、连续斜杠与空段，并限制整体长度。
     *
     * @param path 目录路径（空字符串表示根目录）
     * @throws StorageException 路径不合法时抛出
     */
    public void validatePath(String path) {
        if (path == null || path.isBlank()) {
            throw StorageException.fileNameInvalid("目录路径不能为空");
        }
        if (path.startsWith("/") || path.endsWith("/")) {
            throw StorageException.fileNameInvalid("目录路径不能以斜杠开头或结尾");
        }
        if (path.contains("//")) {
            throw StorageException.fileNameInvalid("目录路径不能包含连续斜杠");
        }
        if (path.contains("..")) {
            throw StorageException.fileNameInvalid("目录路径不能包含路径遍历字符");
        }
        // 逐段校验：每段不得超过单名上限，且不允许再出现分隔符之外的非法字符
        for (String seg : path.split("/")) {
            if (seg.isBlank()) {
                throw StorageException.fileNameInvalid("目录路径不能包含空段");
            }
            if (seg.length() > MAX_NAME_LENGTH) {
                throw StorageException.fileNameInvalid("目录路径中单段名称过长");
            }
            if (seg.contains("\\")) {
                throw StorageException.fileNameInvalid("目录路径不能包含反斜杠");
            }
        }
        if (path.length() > MAX_NAME_LENGTH * 4) {
            throw StorageException.fileNameInvalid("目录路径过长");
        }
    }

    private String validate(String name, String label) {
        if (name == null || name.isBlank()) {
            throw StorageException.fileNameInvalid(label + "不能为空");
        }

        String sanitized = name;

        // 1. 剥离路径遍历字符（..）
        sanitized = sanitized.replace("..", "_");

        // 2. 剥离路径分隔符
        sanitized = sanitized.replace("/", "_");
        sanitized = sanitized.replace("\\", "_");

        // 3. 剥离前导点号（防止隐藏文件和路径遍历）
        sanitized = sanitized.replaceAll("^\\.+", "");

        // 3. 去除首尾空白
        sanitized = sanitized.trim();

        // 4. 截断至最大长度
        if (sanitized.length() > MAX_NAME_LENGTH) {
            sanitized = sanitized.substring(0, MAX_NAME_LENGTH);
        }

        // 5. 清洗后为空则不合法
        if (sanitized.isBlank()) {
            throw StorageException.fileNameInvalid(label + "清洗后为空，请使用合法" + label);
        }

        return sanitized;
    }
}
