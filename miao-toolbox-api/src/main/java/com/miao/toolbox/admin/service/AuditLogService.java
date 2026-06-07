package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.AuditLogQuery;
import com.miao.toolbox.admin.dto.AuditLogResponse;
import com.miao.toolbox.admin.entity.AuditLog;
import com.miao.toolbox.admin.repository.AuditLogRepository;
import com.miao.toolbox.admin.util.SanitizeUtil;
import com.miao.toolbox.common.response.PagedResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    /**
     * 查询审计日志（分页 + 筛选），默认展示最近24小时
     */
    public PagedResponse<AuditLogResponse> queryLogs(AuditLogQuery query) {
        // 默认时间范围：最近24小时
        LocalDateTime startTime = query.getStartTime();
        LocalDateTime endTime = query.getEndTime();
        if (startTime == null && endTime == null) {
            startTime = LocalDateTime.now().minusHours(24);
        }

        int page = Math.max(query.getPage(), 1) - 1; // 转为0-based
        int pageSize = Math.min(Math.max(query.getPageSize(), 1), 100); // 限制最大100

        Page<AuditLog> pageResult = auditLogRepository.findByFilters(
                startTime,
                endTime,
                query.getUserId(),
                query.getToolId(),
                query.getResponseStatus(),
                PageRequest.of(page, pageSize, Sort.by(Sort.Direction.DESC, "createdAt"))
        );

        List<AuditLogResponse> items = pageResult.getContent().stream()
                .map(this::toResponse)
                .toList();

        PagedResponse<AuditLogResponse> response = new PagedResponse<>();
        response.setItems(items);
        response.setTotal(pageResult.getTotalElements());
        response.setPage(query.getPage());
        response.setPageSize(pageSize);
        return response;
    }

    private AuditLogResponse toResponse(AuditLog log) {
        AuditLogResponse resp = new AuditLogResponse();
        resp.setId(log.getId());
        resp.setUserId(log.getUserId());
        resp.setToolId(log.getToolId());
        resp.setRequestSummary(SanitizeUtil.sanitize(log.getRequestSummary()));
        resp.setResponseStatus(log.getResponseStatus());
        resp.setDurationMs(log.getDurationMs());
        resp.setTokenConsumption(log.getTokenConsumption());
        resp.setCreatedAt(log.getCreatedAt());
        return resp;
    }
}
