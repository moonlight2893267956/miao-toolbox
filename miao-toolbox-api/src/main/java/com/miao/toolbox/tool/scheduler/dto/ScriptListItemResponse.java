package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.ScriptType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 脚本列表项响应（FR-1）——精简字段，不含脚本内容。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScriptListItemResponse {

    private Long id;

    private String name;

    private String description;

    private ScriptType scriptType;

    private Integer latestVersion;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
