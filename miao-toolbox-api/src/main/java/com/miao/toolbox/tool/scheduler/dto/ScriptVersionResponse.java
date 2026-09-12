package com.miao.toolbox.tool.scheduler.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 脚本版本响应（FR-1）——版本历史列表项。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScriptVersionResponse {

    private Long id;

    private Long scriptId;

    private Integer version;

    private String content;

    private LocalDateTime createdAt;
}
