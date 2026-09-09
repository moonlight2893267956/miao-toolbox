package com.miao.toolbox.tool.scheduler.service;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.network.infrastructure.SsrfProtector;
import com.miao.toolbox.tool.scheduler.dto.CreateTaskRequest;
import com.miao.toolbox.tool.scheduler.dto.TaskListItemResponse;
import com.miao.toolbox.tool.scheduler.dto.TaskResponse;
import com.miao.toolbox.tool.scheduler.dto.UpdateTaskRequest;
import com.miao.toolbox.tool.scheduler.entity.ExecutionStatus;
import com.miao.toolbox.tool.scheduler.entity.HttpTargetConfig;
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
import java.util.function.Function;
import java.util.stream.Collectors;

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

    private final ScheduledTaskRepository taskRepository;
    private final TaskExecutionRepository executionRepository;
    private final SchedulerService schedulerService;
    private final SchedulerCryptoService cryptoService;
    private final SsrfProtector ssrfProtector;

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
                .notifyConfig(req.getNotifyConfig())
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
        ScheduledTask task = taskRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_TASK_NOT_FOUND,
                        "任务不存在：" + id, 404));

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
        task.setNotifyConfig(req.getNotifyConfig());
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
        ScheduledTask task = taskRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_TASK_NOT_FOUND,
                        "任务不存在：" + id, 404));
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
        ScheduledTask task = taskRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_TASK_NOT_FOUND,
                        "任务不存在：" + id, 404));
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
        ScheduledTask task = taskRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.SCHEDULER_TASK_NOT_FOUND,
                        "任务不存在：" + id, 404));
        return toResponse(task, resolveLastStatus(List.of(id)));
    }

    public PagedResponse<TaskListItemResponse> listTasks(int page, int pageSize,
                                                         String search, TaskStatus status) {
        PageRequest pageRequest = PageRequest.of(Math.max(page - 1, 0), Math.min(Math.max(pageSize, 1), 100),
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
        return new PagedResponse<>(items, result.getTotalElements(), page, Math.min(Math.max(pageSize, 1), 100));
    }

    // ------------------------------------------------------------
    // 校验
    // ------------------------------------------------------------

    /**
     * 校验并规范化 cron 表达式（FR-2：支持 5/6 位方言）。
     *
     * <p>Spring {@link CronExpression} 仅支持 6 位（秒 分 时 日 月 周）；
     * 5 位 Unix 方言自动前补秒字段 0。返回规范化后的 6 位表达式统一存储与调度，
     * 避免调度器与展示两处各自转换。
     */
    private String normalizeCron(String cronExpression) {
        String trimmed = cronExpression == null ? "" : cronExpression.trim();
        if (CronExpression.isValidExpression(trimmed)) {
            return trimmed;
        }
        String sixField = "0 " + trimmed;
        if (trimmed.split("\\s+").length == 5 && CronExpression.isValidExpression(sixField)) {
            return sixField;
        }
        throw new BusinessException(ErrorCode.SCHEDULER_CRON_INVALID,
                "cron 表达式无效：" + cronExpression, 400);
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
            URI uri;
            try {
                uri = URI.create(http.getUrl());
            } catch (Exception e) {
                throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID, "目标 URL 格式非法", 400);
            }
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID,
                        "目标 URL 仅支持 http/https 协议", 400);
            }
            String host = uri.getHost();
            if (host == null || host.isBlank()) {
                throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID, "目标 URL 缺少主机名", 400);
            }
            ssrfProtector.resolveAndValidate(host);
        } else if (targetType == TargetType.PRESET) {
            if (!(config instanceof com.miao.toolbox.tool.scheduler.entity.PresetTargetConfig preset)
                    || preset.getTemplate() == null || preset.getTemplate().isBlank()) {
                throw new BusinessException(ErrorCode.SCHEDULER_TARGET_INVALID,
                        "预置模板目标缺少 template", 400);
            }
        }
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
                        return new TargetHeader(h.getName(), kept == null ? "" : kept, true);
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

    private String currentOperator() {
        return Optional.ofNullable(org.springframework.security.core.context.SecurityContextHolder
                        .getContext().getAuthentication())
                .map(java.security.Principal::getName)
                .orElse("unknown");
    }
}
