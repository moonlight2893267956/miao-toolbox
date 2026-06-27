package com.miao.toolbox.observability;

import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.observability.dto.AiInvocationQuery;
import com.miao.toolbox.observability.dto.AiInvocationResponse;
import com.miao.toolbox.observability.dto.UserUsageSummaryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

/**
 * AI 调用日志查询 Service。
 */
@Service
@RequiredArgsConstructor
public class AiInvocationQueryService {

    private final AiInvocationRepository repository;
    private final UserRepository userRepository;

    /** 用户名缓存（避免频繁查询） */
    private final Map<Long, String> usernameCache = new HashMap<>();

    /**
     * 分页查询调用日志。
     */
    public PagedResponse<AiInvocationResponse> queryLogs(AiInvocationQuery query) {
        LocalDateTime startTime = parseDateTime(query.getStartTime(),
                LocalDate.now().minusDays(7).atStartOfDay());
        LocalDateTime endTime = parseDateTime(query.getEndTime(), null);

        Page<AiInvocation> page = repository.findByFilters(
                query.getUserId(),
                query.getAgentName(),
                query.getModel(),
                query.getStatus(),
                startTime,
                endTime,
                PageRequest.of(query.getPage() - 1, query.getPageSize(),
                        Sort.by(Sort.Direction.DESC, "createdAt"))
        );

        var items = page.getContent().stream()
                .map(this::toResponse)
                .toList();

        return new PagedResponse<>(items, page.getTotalElements(),
                query.getPage(), query.getPageSize());
    }

    /**
     * 获取所有不同的 Agent 名称（用于下拉筛选选项）。
     */
    public java.util.List<String> getAgentOptions() {
        return repository.findDistinctAgentNames();
    }

    /**
     * 获取所有不同的模型名称（用于下拉筛选选项）。
     */
    public java.util.List<String> getModelOptions() {
        return repository.findDistinctModels();
    }

    /**
     * 获取用户 AI 用量统计。
     */
    public UserUsageSummaryResponse getUserUsageSummary(Long userId) {
        LocalDateTime since30d = LocalDate.now().minusDays(30).atStartOfDay();
        Object[] row = repository.getUserUsageSummary(userId, since30d);

        UserUsageSummaryResponse response = new UserUsageSummaryResponse();
        if (row != null && row.length > 0) {
            Object[] r = (Object[]) row[0];
            response.setTotalCalls(toLong(r[0]));
            response.setTotalTokens(toLong(r[1]));
            long failureCount = toLong(r[2]);
            response.setFailureRate(response.getTotalCalls() > 0
                    ? (double) failureCount / response.getTotalCalls() : 0.0);
            response.setLastCalledAt(r[3] instanceof java.sql.Timestamp ts
                    ? ts.toLocalDateTime().toString() : String.valueOf(r[3]));
            response.setAgentCount(toLong(r[4]));
            response.setModelCount(toLong(r[5]));
        }
        return response;
    }

    // ========== 私有方法 ==========

    private AiInvocationResponse toResponse(AiInvocation invocation) {
        AiInvocationResponse resp = new AiInvocationResponse();
        resp.setId(invocation.getId());
        resp.setRequestId(invocation.getRequestId());
        resp.setUserId(invocation.getUserId());
        resp.setUsername(getUsername(invocation.getUserId()));
        resp.setAgentName(invocation.getAgentName());
        resp.setModel(invocation.getModel());
        resp.setMode(invocation.getMode());
        resp.setStatus(invocation.getStatus());
        resp.setErrorCode(invocation.getErrorCode());
        resp.setLatencyMs(invocation.getLatencyMs());
        resp.setPromptTokens(invocation.getPromptTokens());
        resp.setCompletionTokens(invocation.getCompletionTokens());
        resp.setTotalTokens(invocation.getTotalTokens());
        resp.setTraceId(invocation.getTraceId());
        resp.setCreatedAt(invocation.getCreatedAt());
        return resp;
    }

    private String getUsername(Long userId) {
        if (userId == null) return null;
        return usernameCache.computeIfAbsent(userId, id ->
                userRepository.findById(id)
                        .map(u -> u.getUsername())
                        .orElse("unknown"));
    }

    private LocalDateTime parseDateTime(String value, LocalDateTime defaultVal) {
        if (value == null || value.isBlank()) return defaultVal;
        try {
            return LocalDateTime.parse(value, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (Exception e) {
            try {
                return LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE).atStartOfDay();
            } catch (Exception e2) {
                return defaultVal;
            }
        }
    }

    private long toLong(Object obj) {
        if (obj == null) return 0;
        if (obj instanceof Number n) return n.longValue();
        return 0;
    }
}
