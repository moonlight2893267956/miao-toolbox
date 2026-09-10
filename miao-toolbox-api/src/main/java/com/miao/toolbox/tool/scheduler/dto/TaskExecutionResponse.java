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
 * 单次执行详情响应（FR-9）。
 *
 * <p>{@code requestSummary} / {@code responseSummary} 由 DB 的 JSON 文本解析为 JSON 对象
 * 内嵌返回（而非转义字符串），便于前端直接渲染；其中敏感 header 值在写入执行记录时
 * 已由执行引擎用 {@code SensitiveMasker.maskPartial} 脱敏（前 4 后 4 + 星号）。
 *
 * <p>摘要用 {@code Map}（而非 JsonNode）承载：HTTP 响应的 JSON 序列化由 Spring MVC 转换器完成，
 * 普通 Map/List/String/Number 的序列化与 Jackson 版本无关，避免跨 Jackson 主版本的类型陷阱。
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

    /** 请求摘要（method/url/headers 脱敏/bodyPreview），解析后的 JSON 对象 */
    private Map<String, Object> requestSummary;

    /** 响应摘要（statusCode/statusText/bodyPreview/bodyBytes/truncated） */
    private Map<String, Object> responseSummary;

    /** 错误信息 */
    private String errorMessage;
}
