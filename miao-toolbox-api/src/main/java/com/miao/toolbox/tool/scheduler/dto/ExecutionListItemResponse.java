package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 执行历史列表项响应（FR-9）——精简字段，不含请求/响应摘要。
 *
 * <p>SKIPPED 记录（skip 重叠）的 startedAt/finishedAt/durationMs 为空。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExecutionListItemResponse {

    private Long id;

    /** 触发类型：SCHEDULED / MANUAL */
    private TriggerType triggerType;

    /** 触发时间 */
    private LocalDateTime triggeredAt;

    /** 开始执行时间（SKIPPED 为空） */
    private LocalDateTime startedAt;

    /** 结束时间（SKIPPED 为空） */
    private LocalDateTime finishedAt;

    /** 耗时（毫秒） */
    private Integer durationMs;

    private ExecutionStatus status;

    /** 实际重试次数 */
    private Integer retryCount;
}
