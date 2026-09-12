package com.miao.toolbox.tool.scheduler.dto;

import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.TriggerType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 单次执行详情响应（FR-10）。
 *
 * <p>V35 改造：列名保留，语义变更：
 * <ul>
 *   <li>requestSummary: 参数快照 {"params": {...}}</li>
 *   <li>responseSummary: {"exitCode": 0, "stdout": "...", "stderr": "...", "truncated": false}</li>
 * </ul>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskExecutionResponse {

    private Long id;

    /** 关联任务 ID */
    private Long taskId;

    private TriggerType triggerType;

    private LocalDateTime triggeredAt;

    private LocalDateTime startedAt;

    private LocalDateTime finishedAt;

    private Integer durationMs;

    private ExecutionStatus status;

    private Integer retryCount;

    /** 请求摘要（参数快照），解析后的 JSON 对象 */
    private Map<String, Object> requestSummary;

    /** 响应摘要（exitCode/stdout/stderr/truncated），解析后的 JSON 对象 */
    private Map<String, Object> responseSummary;

    /** 错误信息 */
    private String errorMessage;
}
