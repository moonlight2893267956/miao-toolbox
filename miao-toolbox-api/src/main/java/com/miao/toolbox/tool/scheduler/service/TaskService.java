package com.miao.toolbox.tool.scheduler.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import com.miao.toolbox.tool.scheduler.dto.CreateTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.ExecutionListItemResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskExecutionResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskListItemResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskResponse;
import com.miao.toolbox.tool.scheduler.dto.UpdateTaskRequest;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyTrigger;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.TargetHeader;
import com.miao.toolbox.tool.scheduler.entity.TargetType;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import com.miao.toolbox.tool.scheduler.util.SensitiveMasker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.regex.Pattern;

/**
 * 定时任务 CRUD 编排（FR-1/FR-2/FR-13/FR-14）。
 *
 * <p>职责：请求校验（name/cron/时区/SSRF）→ 敏感 header 加密 → 持久化 →
 * 调度生命周期操作（经 {@link SchedulerService#runAfterCommit(Runnable)} 在事务提交后执行）。
 * 调度注册/取消本身不写库，失败时由重启恢复兜底（NFR-2）。
 *
 * <p>审计：audit_logs 表在项目中从未启用（无实体与写入管道），本模块以结构化日志
 * 记录操作（taskId + action + 操作者），后续如启用审计写入再对齐。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    private static final String SENSITIVE_PLACEHOLDER = "****";
    private static final String DEFAULT_TIMEZONE = "Asia/Shanghai";
    private static final int DEFAULT_RETRY_COUNT = 0;
    private static final int DEFAULT_RETRY_INTERVAL = 60;
    private static final int DEFAULT_TIMEOUT_SECONDS = 30;
    /** 通知邮箱格式（实用级校验，非 RFC 5322 全量） */
    private static final java.util.regex.Pattern EMAIL_PATTERN =
            java.util.regex.Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    private final ScheduledTaskRepository taskRepository;
    private final TaskExecutionRepository executionRepository;
    private final SchedulerService schedulerService;
    private final SchedulerCryptoService cryptoService;
    private final SsrfProtector ssrfProtector;
    private final ExecutionEngine executionEngine;
    private final ObjectMapper objectMapper;

    // ------------------------------------------------------------
    // 创建
    // ------------------------------------------------------------

    @Transactional
    public TaskResponse createTask(CreateTaskRequest req) {
        if (taskRepository.existsByName(req.getName().trim())) {
            throw new BusinessException(ErrorCode.SCHEDULER_TASK_NAME_DUPLICATED,
                    "任务名称已存在：" + req.getName().trim(), 400);
        }
        String timezone = normalizeTimezone(req.getTimezone());
        String normalizedCron = normalizeCron(req.getCronExpression());
        validateTarget(req.getTargetType(), req.getTargetConfig());

        ScheduledTask task = ScheduledTask.builder()
                .name(req.getName().trim())
                .description(req.getDescription())
                .targetType(req.getTargetType())
                .targetConfig(encryptSensitiveHeaders(req.getTargetType(), req.getTargetConfig(), null))
                .cronExpression(normalizedCron)
                .timezone(timezone)
                .validFrom(req.getValidFrom())
                .validUntil(req.getValidUntil())
                .status(TaskStatus.ENABLED)
                .retryCount(req.getRetryCount() != null ? req.getRetryCount() : DEFAULT_RETRY_COUNT)
                .retryInterval(req.getRetryInterval() != null ? req.getRetryInterval() : DEFAULT_RETRY_INTERVAL)
                .timeoutSeconds(req.getTimeoutSeconds() != null ? req.getTimeoutSeconds() : DEFAULT_TIMEOUT_SECONDS)
                .notifyConfig(normalizeAndValidateNotify(req.getNotifyConfig()))
                .build();
        ScheduledTask saved = taskRepository.save(task);

        schedulerService.runAfterCommit(() -> schedulerService.register(saved));
        log.info("[task:{}] action=CREATE name={} operator={}", saved.getId(), saved.getName(), currentOperator());
        return toResponse(saved, resolveLastStatus(List.of(saved.getId())));
    }

    // ------------------------------------------------------------
    // 编辑
    // ------------------------------------------------------------

    @Transactional
    public TaskResponse updateTask(Long id, UpdateTaskRequest req) {
        ScheduledTask task = requireTask(id);

        String newName = req.getName().trim();
        if (!task.getName().equals(newName) && taskRepository.existsByName(newName)) {
            throw new BusinessException(ErrorCode.SCHEDULER_TASK_NAME_DUPLICATED,
                    "任务名称已存在：" + newName, 400);
        }
        String timezone = normalizeTimezone(req.getTimezone());
        String normalizedCron = normalizeCron(req.getCronExpression());
        validateTarget(req.getTargetType(), req.getTargetConfig());

        task.setName(newName);
        task.setDescription(req.getDescription());
        task.setTargetType(req.getTargetType());
        task.setTargetConfig(encryptSensitiveHeaders(req.getTargetType(), req.getTargetConfig(), task.getTargetConfig()));
        task.setCronExpression(normalizedCron);
        task.setTimezone(timezone);
        task.setValidFrom(req.getValidFrom());
        task.setValidUntil(req.getValidUntil());
        if (req.getRetryCount() != null) {
            task.setRetryCount(req.getRetryCount());
        }
        if (req.getRetryInterval() != null) {
            task.setRetryInterval(req.getRetryInterval());
        }
        if (req.getTimeoutSeconds() != null) {
            task.setTimeoutSeconds(req.getTimeoutSeconds());
        }
        task.setNotifyConfig(normalizeAndValidateNotify(req.getNotifyConfig()));
        ScheduledTask saved = taskRepository.save(task);

        boolean wasEnabled = saved.getStatus() == TaskStatus.ENABLED;
        schedulerService.runAfterCommit(() -> {
            if (wasEnabled) {
                schedulerService.reschedule(saved);
            }
        });
        log.info("[task:{}] action=UPDATE operator={}", saved.getId(), currentOperator());
        return toResponse(saved, resolveLastStatus(List.of(saved.getId())));
    }

    // ------------------------------------------------------------
    // 删除
    // ------------------------------------------------------------

    @Transactional
    public void deleteTask(Long id) {
        ScheduledTask task = requireTask(id);
        executionRepository.deleteByTaskId(id);
        taskRepository.delete(task);
        schedulerService.runAfterCommit(() -> schedulerService.unregister(id));
        log.info("[task:{}] action=DELETE name={} operator={}", id, task.getName(), currentOperator());
    }

    // ------------------------------------------------------------
    // 启停
    // ------------------------------------------------------------

    @Transactional
    public TaskResponse toggleTask(Long id, String action) {
        ScheduledTask task = requireTask(id);
        switch (action == null ? "" : action.toLowerCase()) {
            case "pause" -> {
                task.setStatus(TaskStatus.PAUSED);
                ScheduledTask saved = taskRepository.save(task);
                schedulerService.runAfterCommit(() -> schedulerService.unregister(id));
                log.info("[task:{}] action=PAUSE operator={}", id, currentOperator());
                return toResponse(saved, resolveLastStatus(List.of(id)));
            }
            case "resume" -> {
                task.setStatus(TaskStatus.ENABLED);
                ScheduledTask saved = taskRepository.save(task);
                schedulerService.runAfterCommit(() -> schedulerService.register(saved));
                log.info("[task:{}] action=RESUME operator={}", id, currentOperator());
                return toResponse(saved, resolveLastStatus(List.of(id)));
            }
            default -> throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "action 仅支持 pause / resume", 400);
        }
    }

    // ------------------------------------------------------------
    // 查询
    // ------------------------------------------------------------

    public TaskResponse getTask(Long id) {
        ScheduledTask task = requireTask(id);
        return toResponse(task, resolveLastStatus(List.of(id)));
    }

    public PagedResponse<TaskListItemResponse> listTasks(int page, int pageSize,
                                                         String search, TaskStatus status) {
        int normalizedPageSize = normalizePageSize(pageSize);
        PageRequest pageRequest = PageRequest.of(Math.max(page - 1, 0), normalizedPageSize,
                Sort.by(Sort.Direction.DESC, "id"));
        String keyword = (search == null || search.isBlank()) ? null : search.trim();
        Page<ScheduledTask> result;
        if (keyword != null && status != null) {
            result = taskRepository.findByNameContainingIgnoreCaseAndStatus(keyword, status, pageRequest);
        } else if (keyword != null) {
            result = taskRepository.findByNameContainingIgnoreCase(keyword, pageRequest);
        } else if (status != null) {
            result = taskRepository.findByStatus(status, pageRequest);
        } else {
            result = taskRepository.findAll(pageRequest);
        }

        List<Long> ids = result.getContent().stream().map(ScheduledTask::getId).toList();
        Map<Long, String> lastStatus = resolveLastStatus(ids);
        List<TaskListItemResponse> items = result.getContent().stream()
                .map(t -> toListItem(t, lastStatus.get(t.getId())))
                .toList();
        return new PagedResponse<>(items, result.getTotalElements(), page, normalizedPageSize);
    }

    // ------------------------------------------------------------
    // 执行历史与详情（FR-9，ts-1-5）
    // ------------------------------------------------------------

    /**
     * 执行历史分页（FR-9）：按 triggered_at 倒序，支持 status 筛选；任务不存在返回 404。
     */
    public PagedResponse<ExecutionListItemResponse> listExecutions(Long taskId, int page, int pageSize,
                                                                   ExecutionStatus status) {
        requireTask(taskId);
        int normalizedPageSize = normalizePageSize(pageSize);
        PageRequest pageRequest = PageRequest.of(Math.max(page - 1, 0), normalizedPageSize);
        Page<TaskExecution> result = status == null
                ? executionRepository.findByTaskIdOrderByTriggeredAtDesc(taskId, pageRequest)
                : executionRepository.findByTaskIdAndStatusOrderByTriggeredAtDesc(taskId, status, pageRequest);
        List<ExecutionListItemResponse> items = result.getContent().stream()
                .map(this::toExecutionListItem)
                .toList();
        return new PagedResponse<>(items, result.getTotalElements(), page, normalizedPageSize);
    }

    /**
     * 单次执行详情（FR-9）：request_summary / response_summary 解析为 JSON 对象返回
     * （敏感 header 值已在执行引擎写入时脱敏，此处不再处理）。
     */
    public TaskExecutionResponse getExecution(Long executionId) {
        TaskExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_EXECUTION_NOT_FOUND,
                        "执行记录不存在：" + executionId, 404));
        return toExecutionResponse(execution);
    }

    // ------------------------------------------------------------
    // 手动触发（FR-6，ts-1-4）
    // ------------------------------------------------------------

    /**
     * 手动触发任务执行：立即异步提交一次执行（trigger_type=MANUAL），
     * 不影响 cron 调度的下次执行时间；受重试/超时/通知策略约束（与调度触发一致）。
     * 响应立即返回，不等待执行完成。
     */
    public void executeTask(Long id) {
        ScheduledTask task = requireTask(id);
        log.info("[task:{}] action=MANUAL_TRIGGER name={} operator={}", id, task.getName(), currentOperator());
        executionEngine.triggerManual(id);
    }

    // ------------------------------------------------------------
    // 校验
    // ------------------------------------------------------------

    /**
     * 校验并规范化 cron 表达式（FR-2：支持 5/6 位方言）。
     *
     * <p>规范化逻辑在 {@link com.miao.toolbox.tool.scheduler.util.CronSupport#normalize(String)}
     * （与 validate-cron 端点共用）；返回规范化后的 6 位表达式统一存储与调度。
     */
    private String normalizeCron(String cronExpression) {
        String normalized = com.miao.toolbox.tool.scheduler.util.CronSupport.normalize(cronExpression);
        if (normalized == null) {
            throw new BusinessException(ErrorCode.SCHEDULER_CRON_INVALID,
                    "cron 表达式无效：" + cronExpression, 400);
        }
        return normalized;
    }

    private String normalizeTimezone(String timezone) {
        String tz = (timezone == null || timezone.isBlank()) ? DEFAULT_TIMEZONE : timezone.trim();
        try {
            ZoneId.of(tz);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "时区无效：" + tz, 400);
        }
        return tz;
    }

    /**
     * 目标配置校验（FR-13）：HTTP 目标校验协议白名单 + SSRF（SsrfProtector 拦截时抛
     * NETWORK_SSRF_BLOCKED，全局异常处理器透传）；PRESET 目标校验模板代码非空。
     */
    private void validateTarget(TargetType targetType, com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig config) {
        if (targetType == TargetType.HTTP) {
            if (!(config instanceof HttpTargetConfig http)) {
                throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID,
                        "HTTP 目标配置结构与 targetType 不匹配", 400);
            }
            validateHttpUrl(http.getUrl(), "目标 URL");
        } else if (targetType == TargetType.PRESET) {
            if (!(config instanceof com.miao.toolbox.tool.scheduler.entity.PresetTargetConfig preset)
                    || preset.getTemplate() == null || preset.getTemplate().isBlank()) {
                throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID,
                        "预置模板目标缺少 template", 400);
            }
        }
    }

    /**
     * HTTP URL 校验（FR-13，供任务目标与 Webhook 回调共用）：协议白名单、
     * 主机名非空、SSRF（SsrfProtector 拦截抛 NETWORK_SSRF_BLOCKED 透传）。
     */
    private void validateHttpUrl(String url, String label) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID, label + "格式非法", 400);
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID,
                    label + "仅支持 http/https 协议", 400);
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID, label + "缺少主机名", 400);
        }
        ssrfProtector.resolveAndValidate(host);
    }

    /**
     * 通知配置校验与规范化（FR-10/FR-11/FR-13）：
     * Webhook URL 保存时即做协议/SSRF 校验（违规 URL 保存时拒绝）；收件人校验邮箱格式；
     * trigger 缺省兜底 ON_FAILURE（Jackson 反序列化不经过 Builder 默认值）。
     * 返回规范化后的配置（原参数对象不被修改）。
     */
    private NotifyConfig normalizeAndValidateNotify(NotifyConfig notify) {
        if (notify == null) {
            return null;
        }
        boolean empty = (notify.getWebhook() == null || notify.getWebhook().getUrl() == null
                || notify.getWebhook().getUrl().isBlank())
                && (notify.getEmail() == null || notify.getEmail().getRecipients() == null
                || notify.getEmail().getRecipients().isEmpty());
        if (empty) {
            return null;
        }

        NotifyConfig.WebhookNotify webhook = notify.getWebhook();
        if (webhook != null && webhook.getUrl() != null && !webhook.getUrl().isBlank()) {
            validateHttpUrl(webhook.getUrl().trim(), "Webhook 回调 URL");
        }
        NotifyConfig.EmailNotify email = notify.getEmail();
        if (email != null && email.getRecipients() != null && !email.getRecipients().isEmpty()) {
            for (String recipient : email.getRecipients()) {
                if (recipient == null || !EMAIL_PATTERN.matcher(recipient.trim()).matches()) {
                    throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                            "通知邮箱格式无效：" + recipient, 400);
                }
            }
        }

        NotifyTrigger webhookTrigger = webhook == null ? null
                : (webhook.getTrigger() == null ? NotifyTrigger.ON_FAILURE : webhook.getTrigger());
        NotifyTrigger emailTrigger = email == null ? null
                : (email.getTrigger() == null ? NotifyTrigger.ON_FAILURE : email.getTrigger());

        return NotifyConfig.builder()
                .webhook(webhook == null ? null : NotifyConfig.WebhookNotify.builder()
                        .url(webhook.getUrl() == null ? null : webhook.getUrl().trim())
                        .trigger(webhookTrigger)
                        .build())
                .email(email == null ? null : NotifyConfig.EmailNotify.builder()
                        .recipients(email.getRecipients().stream()
                                .map(String::trim).toList())
                        .trigger(emailTrigger)
                        .build())
                .build();
    }

    // ------------------------------------------------------------
    // 敏感字段处理（FR-14）
    // ------------------------------------------------------------

    /**
     * 加密 sensitive header 值。编辑场景（oldConfig 非 null）下，占位值（空/****）
     * 按同名 header 保留原密文（不回显明文的回写保护）。
     */
    private com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig encryptSensitiveHeaders(
            TargetType targetType,
            com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig config,
            com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig oldConfig) {
        if (!(config instanceof HttpTargetConfig http)) {
            return config;
        }
        Map<String, String> oldSensitive = oldConfig instanceof HttpTargetConfig oldHttp
                ? oldHttp.getHeaders().stream()
                        .filter(TargetHeader::isSensitive)
                        .collect(Collectors.toMap(TargetHeader::getName, TargetHeader::getValue, (a, b) -> a))
                : Map.of();

        List<TargetHeader> headers = http.getHeaders() == null ? List.of() : http.getHeaders().stream()
                .map(h -> {
                    if (!h.isSensitive()) {
                        return h;
                    }
                    String v = h.getValue();
                    if (v == null || v.isBlank() || SENSITIVE_PLACEHOLDER.equals(v)) {
                        String kept = oldSensitive.get(h.getName());
                        if (kept == null) {
                            // 无旧密文可保留：新建、或编辑时 header 改名/新增——占位值会让密钥静默丢失，拒绝
                            throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID,
                                    "敏感 header '" + h.getName() + "' 需要提供实际值（当前为占位符且无历史值可保留）", 400);
                        }
                        return new TargetHeader(h.getName(), kept, true);
                    }
                    return new TargetHeader(h.getName(), cryptoService.encrypt(v), true);
                })
                .toList();
        return new HttpTargetConfig(http.getMethod(), http.getUrl(), headers,
                http.getBody(), http.getTimeoutSeconds());
    }

    /** 深拷贝目标配置并把敏感 header 值替换为 ****（API 响应不回显明文/密文）。 */
    private com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig maskTargetConfig(
            com.miao.toolbox.tool.scheduler.entity.TaskTargetConfig config) {
        if (!(config instanceof HttpTargetConfig http)) {
            return config;
        }
        List<TargetHeader> masked = http.getHeaders() == null ? List.of() : http.getHeaders().stream()
                .map(h -> h.isSensitive()
                        ? new TargetHeader(h.getName(), SensitiveMasker.maskFull(h.getValue()), true)
                        : h)
                .toList();
        return new HttpTargetConfig(http.getMethod(), http.getUrl(), masked,
                http.getBody(), http.getTimeoutSeconds());
    }

    // ------------------------------------------------------------
    // 响应组装
    // ------------------------------------------------------------

    private Map<Long, String> resolveLastStatus(List<Long> taskIds) {
        if (taskIds.isEmpty()) {
            return Map.of();
        }
        return executionRepository.findLatestByTaskIds(taskIds).stream()
                .collect(Collectors.toMap(TaskExecution::getTaskId,
                        e -> e.getStatus().name(), (a, b) -> a));
    }

    private TaskResponse toResponse(ScheduledTask task, Map<Long, String> lastStatus) {
        return TaskResponse.builder()
                .id(task.getId())
                .name(task.getName())
                .description(task.getDescription())
                .targetType(task.getTargetType())
                .targetConfig(maskTargetConfig(task.getTargetConfig()))
                .cronExpression(task.getCronExpression())
                .timezone(task.getTimezone())
                .validFrom(task.getValidFrom())
                .validUntil(task.getValidUntil())
                .status(task.getStatus())
                .retryCount(task.getRetryCount())
                .retryInterval(task.getRetryInterval())
                .timeoutSeconds(task.getTimeoutSeconds())
                .notifyConfig(task.getNotifyConfig())
                .nextRunAt(schedulerService.nextRunAt(task))
                .lastExecutionStatus(lastStatus.get(task.getId()))
                .createdAt(task.getCreatedAt())
                .updatedAt(task.getUpdatedAt())
                .build();
    }

    private TaskListItemResponse toListItem(ScheduledTask task, String lastStatus) {
        return TaskListItemResponse.builder()
                .id(task.getId())
                .name(task.getName())
                .targetType(task.getTargetType())
                .cronExpression(task.getCronExpression())
                .status(task.getStatus())
                .nextRunAt(schedulerService.nextRunAt(task))
                .lastExecutionStatus(lastStatus)
                .createdAt(task.getCreatedAt())
                .build();
    }

    // ------------------------------------------------------------
    // 执行记录映射（FR-9，ts-1-5）
    // ------------------------------------------------------------

    private ExecutionListItemResponse toExecutionListItem(TaskExecution execution) {
        return ExecutionListItemResponse.builder()
                .id(execution.getId())
                .triggerType(execution.getTriggerType())
                .triggeredAt(execution.getTriggeredAt())
                .startedAt(execution.getStartedAt())
                .finishedAt(execution.getFinishedAt())
                .durationMs(execution.getDurationMs())
                .status(execution.getStatus())
                .retryCount(execution.getRetryCount())
                .build();
    }

    private TaskExecutionResponse toExecutionResponse(TaskExecution execution) {
        return TaskExecutionResponse.builder()
                .id(execution.getId())
                .taskId(execution.getTaskId())
                .triggerType(execution.getTriggerType())
                .triggeredAt(execution.getTriggeredAt())
                .startedAt(execution.getStartedAt())
                .finishedAt(execution.getFinishedAt())
                .durationMs(execution.getDurationMs())
                .status(execution.getStatus())
                .retryCount(execution.getRetryCount())
                .requestSummary(parseSummary(execution.getRequestSummary()))
                .responseSummary(parseSummary(execution.getResponseSummary()))
                .errorMessage(execution.getErrorMessage())
                .build();
    }

    /**
     * 解析执行摘要 JSON 文本为 Map（JSON 对象）：null/空白返回 null；解析失败返回 null 并告警
     * （不抛异常——历史脏数据不应让详情接口 500）。
     *
     * <p>返回 Map/List/String/Number 等普通类型：HTTP 响应序列化由 Spring MVC 转换器完成，
     * 与业务侧 ObjectMapper 分属不同 Jackson 主版本，JsonNode 会被当普通 bean 序列化。
     */
    private Map<String, Object> parseSummary(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            log.warn("execution summary JSON parse failed: {}", e.getMessage());
            return null;
        }
    }

    // ------------------------------------------------------------
    // 私有辅助
    // ------------------------------------------------------------

    private ScheduledTask requireTask(Long id) {
        return taskRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_TASK_NOT_FOUND,
                        "任务不存在：" + id, 404));
    }

    /** 分页大小归一化（1~100），任务列表与执行历史共用。 */
    private int normalizePageSize(int pageSize) {
        return Math.min(Math.max(pageSize, 1), 100);
    }

    private String currentOperator() {
        return Optional.ofNullable(org.springframework.security.core.context.SecurityContextHolder
                        .getContext().getAuthentication())
                .map(java.security.Principal::getName)
                .orElse("unknown");
    }
}
