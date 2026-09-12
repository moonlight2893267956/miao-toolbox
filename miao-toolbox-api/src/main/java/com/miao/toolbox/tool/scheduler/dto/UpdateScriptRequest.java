package com.miao.toolbox.tool.scheduler.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 编辑脚本请求（FR-1）。
 *
 * <p>内容变更生成新版本；名称/描述变更直接更新脚本元信息。
 * 若 {@code content} 与最新版本内容相同则不生成新版本。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateScriptRequest {

    @NotBlank(message = "脚本名称不能为空")
    @Size(min = 2, max = 50, message = "脚本名称长度须为 2-50 字")
    private String name;

    @Size(max = 200, message = "描述最长 200 字")
    private String description;

    /** 脚本内容（若与最新版本不同则生成新版本；为空表示仅更新元信息） */
    private String content;
}
