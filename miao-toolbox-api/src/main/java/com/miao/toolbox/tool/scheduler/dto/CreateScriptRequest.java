package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 创建脚本请求（FR-1）。
 *
 * <p>首次创建生成 v1 版本；{@code content} 为脚本全文（粘贴或上传文件内容）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateScriptRequest {

    @NotBlank(message = "脚本名称不能为空")
    @Size(min = 2, max = 50, message = "脚本名称长度须为 2-50 字")
    private String name;

    @Size(max = 200, message = "描述最长 200 字")
    private String description;

    @NotNull(message = "脚本类型不能为空")
    private ScriptType scriptType;

    @NotBlank(message = "脚本内容不能为空")
    private String content;

    /**
     * 参数声明 JSON 文本：{@code [{name,type,default,desc}]}。
     * <p>type 取值 {@code string}/{@code int}/{@code bool}；可空表示无参数脚本。
     */
    @Size(max = 4096, message = "参数声明过长（上限 4KB）")
    private String paramSchema;
}
