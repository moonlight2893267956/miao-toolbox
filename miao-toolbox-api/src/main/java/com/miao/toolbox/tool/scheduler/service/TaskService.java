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
import com.miao.toolbox.tool.scheduler.entity.NotifyConfig;
import com.miao.toolbox.tool.scheduler.entity.NotifyTrigger;
import com.miao.toolbox.tool.scheduler.entity.ScheduledTask;
import com.miao.toolbox.tool.scheduler.entity.Script;
import com.miao.toolbox.tool.scheduler.entity.TaskExecution;
import com.miao.toolbox.tool.scheduler.entity.TaskStatus;
import com.miao.toolbox.tool.scheduler.repository.ScheduledTaskRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptRepository;
import com.miao.toolbox.tool.scheduler.repository.ScriptVersionRepository;
import com.miao.toolbox.tool.scheduler.repository.TaskExecutionRepository;
import com.miao.toolbox.tool.scheduler.util.CronSupport;
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

/**
 * 定时任务 CRUD、执行历史查询与手动触发编排（FR-3/FR-4/FR-7/FR-9/FR-13）。
 *
 * <p>V35 改造：移除 HTTP/PRESET 目标校验与敏感 header 加密；
 * 改为脚本引用校验（scriptId/scriptVersion 存在性）。
 *
 * <p>Webhook URL 的 SSRF 校验保留（normalizeAndValidateNotify 内）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    private static final String DEFAULT_TIMEZONE = "Asia/Shanghai";
    private static final int DEFAULT_RETRY_COUNT = 0;
    private static final int DEFAULT_RETRY_INTERVAL = 60;
    private static final int DEFAULT_TIMEOUT_SECONDS = 60;
    private static final java.util.regex.Pattern EMAIL_PATTERN =
            java.util.regex.Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    private final ScheduledTaskRepository taskRepository;
    private final TaskExecutionRepository executionRepository;
    private final ScriptRepository scriptRepository;
    private final ScriptVersionRepository scriptVersionRepository;
    private final SchedulerService schedulerService;
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
        validateScript(req.getScriptId(), req.getScriptVersion());

        ScheduledTask task = ScheduledTask.builder()
                .name(req.getName().trim())
                .description(req.getDescription())
                .scriptId(req.getScriptId())
                .scriptVersion(req.getScriptVersion())
                .params(req.getParams())
                .cronExpression(normalizedCron)
                .timezone(timezone)
                .validFrom(req.getValidFrom())
                .validUntil(req.getValidUntil())
                // [2026-09-13 变更] 默认 PAUSED：仅用户显式传 ENABLED 才创建后立即调度
                .status(req.getStatus() == TaskStatus.ENABLED ? TaskStatus.ENABLED : TaskStatus.PAUSED)
                .retryCount(req.getRetryCount() != null ? req.getRetryCount() : DEFAULT_RETRY_COUNT)
                .retryInterval(req.getRetryInterval() != null ? req.getRetryInterval() : DEFAULT_RETRY_INTERVAL)
                .timeoutSeconds(req.getTimeoutSeconds() != null ? req.getTimeoutSeconds() : DEFAULT_TIMEOUT_SECONDS)
                .notifyConfig(normalizeAndValidateNotify(req.getNotifyConfig()))
                .build();
        ScheduledTask saved = taskRepository.save(task);

        // 仅显式 ENABLED 才注册调度；默认 PAUSED 不注册，待用户手动恢复
        if (saved.getStatus() == TaskStatus.ENABLED) {
            schedulerService.runAfterCommit(() -> schedulerService.register(saved));
        }
        log.info("[task:{}] action=CREATE name={} status={} operator={}",
                saved.getId(), saved.getName(), saved.getStatus(), currentOperator());
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
        validateScript(req.getScriptId(), req.getScriptVersion());

        task.setName(newName);
        task.setDescription(req.getDescription());
        task.setScriptId(req.getScriptId());
        task.setScriptVersion(req.getScriptVersion());
        task.setParams(req.getParams());
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
        // 批量查询脚本信息（避免 N+1）
        List<Long> scriptIds = result.getContent().stream()
                .map(ScheduledTask::getScriptId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        Map<Long, Script> scriptMap = scriptIds.isEmpty() ? Map.of()
                : scriptRepository.findAllById(scriptIds).stream()
                .collect(Collectors.toMap(Script::getId, s -> s, (a, b) -> a));

        List<TaskListItemResponse> items = result.getContent().stream()
                .map(t -> toListItem(t, lastStatus.get(t.getId()),
                        t.getScriptId() != null ? scriptMap.get(t.getScriptId()) : null))
                .toList();
        return new PagedResponse<>(items, result.getTotalElements(), page, normalizedPageSize);
    }

    // ------------------------------------------------------------
    // 执行历史与详情（FR-9）
    // ------------------------------------------------------------

    public PagedResponse<ExecutionListItemResponse> listExecutions(Long taskId, int page, int pageSize,
                                                                   ExecutionStatus status) {
        requireTaskExists(taskId);
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

    public TaskExecutionResponse getExecution(Long executionId) {
        TaskExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_EXECUTION_NOT_FOUND,
                        "执行记录不存在：" + executionId, 404));
        return toExecutionResponse(execution);
    }

    // ------------------------------------------------------------
    // 手动触发（FR-7）
    // ------------------------------------------------------------

    public void executeTask(Long id) {
        ScheduledTask task = requireTask(id);
        log.info("[task:{}] action=MANUAL_TRIGGER name={} operator={}", id, task.getName(), currentOperator());
        executionEngine.triggerManual(id);
    }

    // ------------------------------------------------------------
    // 校验
    // ------------------------------------------------------------

    private String normalizeCron(String cronExpression) {
        String normalized = CronSupport.normalize(cronExpression);
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
     * 校验脚本与版本存在性（FR-5）。
     */
    private void validateScript(Long scriptId, Integer scriptVersion) {
        Script script = scriptRepository.findById(scriptId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_SCRIPT_NOT_FOUND,
                        "脚本不存在：" + scriptId, 404));
        scriptVersionRepository.findByScriptIdAndVersion(scriptId, scriptVersion)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_SCRIPT_VERSION_NOT_FOUND,
                        "脚本版本不存在：" + scriptId + " v" + scriptVersion, 404));
    }

    /**
     * Webhook URL 校验（FR-15）：协议白名单、主机名非空、SSRF。
     * 保留用于通知配置中的 Webhook URL 校验。
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
     * 通知配置校验与规范化（FR-11/FR-12/FR-15）。
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
        Script script = task.getScriptId() != null
                ? scriptRepository.findById(task.getScriptId()).orElse(null)
                : null;
        return TaskResponse.builder()
                .id(task.getId())
                .name(task.getName())
                .description(task.getDescription())
                .scriptId(task.getScriptId())
                .scriptVersion(task.getScriptVersion())
                .scriptName(script != null ? script.getName() : null)
                .scriptType(script != null ? script.getScriptType() : null)
                .params(task.getParams())
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

    private TaskListItemResponse toListItem(ScheduledTask task, String lastStatus, Script script) {
        return TaskListItemResponse.builder()
                .id(task.getId())
                .name(task.getName())
                .scriptName(script != null ? script.getName() : null)
                .scriptVersion(task.getScriptVersion())
                .cronExpression(task.getCronExpression())
                .status(task.getStatus())
                .nextRunAt(schedulerService.nextRunAt(task))
                .lastExecutionStatus(lastStatus)
                .createdAt(task.getCreatedAt())
                .build();
    }

    // ------------------------------------------------------------
    // 执行记录映射（FR-9）
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

    private void requireTaskExists(Long id) {
        if (!taskRepository.existsById(id)) {
            throw new BusinessException(ErrorCode.SCHEDULER_TASK_NOT_FOUND,
                    "任务不存在：" + id, 404);
        }
    }

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
