package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 脚本详情响应（FR-1）——含最新版本内容。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScriptResponse {

    private Long id;

    private String name;

    private String description;

    private ScriptType scriptType;

    private Integer latestVersion;

    /** 最新版本内容 */
    private String content;

    /** 参数 schema JSON 文本（脚本级别共享） */
    private String paramSchema;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
