package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.AuditLogQuery;
import com.miao.toolbox.admin.dto.AuditLogResponse;
import com.miao.toolbox.admin.entity.AuditLog;
import com.miao.toolbox.admin.repository.AuditLogRepository;
import com.miao.toolbox.common.response.PagedResponse;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuditLogService 单元测试")
class AuditLogServiceTest {

    @InjectMocks
    private AuditLogService auditLogService;

    @Mock
    private AuditLogRepository auditLogRepository;

    private AuditLog buildAuditLog(Long id, String requestSummary) {
        return AuditLog.builder()
                .id(id)
                .userId(1L)
                .toolId("translation")
                .requestSummary(requestSummary)
                .responseStatus("SUCCESS")
                .durationMs(120)
                .tokenConsumption(50)
                .createdAt(LocalDateTime.now())
                .build();
    }

    @Nested
    @DisplayName("queryLogs 日志查询")
    class QueryLogsTests {

        @Test
        @DisplayName("默认查询最近24小时")
        void defaultQueryLast24Hours() {
            AuditLogQuery query = new AuditLogQuery();
            Page<AuditLog> page = new PageImpl<>(List.of(buildAuditLog(1L, "translate hello")));
            when(auditLogRepository.findByFilters(any(), any(), any(), any(), any(), any(Pageable.class)))
                    .thenReturn(page);

            PagedResponse<AuditLogResponse> result = auditLogService.queryLogs(query);

            assertThat(result.getItems()).hasSize(1);
            assertThat(result.getItems().get(0).getToolId()).isEqualTo("translation");
            verify(auditLogRepository).findByFilters(any(), isNull(), isNull(), isNull(), isNull(), any(Pageable.class));
        }

        @Test
        @DisplayName("按用户ID筛选")
        void filterByUserId() {
            AuditLogQuery query = new AuditLogQuery();
            query.setUserId(1L);
            Page<AuditLog> page = new PageImpl<>(List.of(buildAuditLog(1L, "test")));
            when(auditLogRepository.findByFilters(any(), any(), eq(1L), any(), any(), any(Pageable.class)))
                    .thenReturn(page);

            PagedResponse<AuditLogResponse> result = auditLogService.queryLogs(query);

            assertThat(result.getItems()).hasSize(1);
        }

        @Test
        @DisplayName("按工具ID筛选")
        void filterByToolId() {
            AuditLogQuery query = new AuditLogQuery();
            query.setToolId("translation");
            Page<AuditLog> page = new PageImpl<>(List.of(buildAuditLog(1L, "test")));
            when(auditLogRepository.findByFilters(any(), any(), any(), eq("translation"), any(), any(Pageable.class)))
                    .thenReturn(page);

            PagedResponse<AuditLogResponse> result = auditLogService.queryLogs(query);

            assertThat(result.getItems()).hasSize(1);
        }

        @Test
        @DisplayName("按响应状态筛选")
        void filterByStatus() {
            AuditLogQuery query = new AuditLogQuery();
            query.setResponseStatus("SUCCESS");
            Page<AuditLog> page = new PageImpl<>(List.of(buildAuditLog(1L, "test")));
            when(auditLogRepository.findByFilters(any(), any(), any(), any(), eq("SUCCESS"), any(Pageable.class)))
                    .thenReturn(page);

            PagedResponse<AuditLogResponse> result = auditLogService.queryLogs(query);

            assertThat(result.getItems()).hasSize(1);
        }

        @Test
        @DisplayName("空结果返回空列表")
        void emptyResult() {
            AuditLogQuery query = new AuditLogQuery();
            Page<AuditLog> page = new PageImpl<>(List.of());
            when(auditLogRepository.findByFilters(any(), any(), any(), any(), any(), any(Pageable.class)))
                    .thenReturn(page);

            PagedResponse<AuditLogResponse> result = auditLogService.queryLogs(query);

            assertThat(result.getItems()).isEmpty();
            assertThat(result.getTotal()).isEqualTo(0);
        }

        @Test
        @DisplayName("分页参数校验：page 最小为1，pageSize 最大100")
        void paginationBounds() {
            AuditLogQuery query = new AuditLogQuery();
            query.setPage(0);
            query.setPageSize(200);
            Page<AuditLog> page = new PageImpl<>(List.of());
            when(auditLogRepository.findByFilters(any(), any(), any(), any(), any(), any(Pageable.class)))
                    .thenReturn(page);

            auditLogService.queryLogs(query);

            // 验证传入的 Pageable pageSize 被 clamp 到 100
            ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
            verify(auditLogRepository).findByFilters(any(), any(), any(), any(), any(), captor.capture());
            assertThat(captor.getValue().getPageSize()).isEqualTo(100);
            assertThat(captor.getValue().getPageNumber()).isEqualTo(0); // 0-based
        }
    }

    @Nested
    @DisplayName("日志脱敏")
    class SanitizeTests {

        @Test
        @DisplayName("包含 password 的请求摘要被脱敏")
        void sanitizePassword() {
            AuditLog log = buildAuditLog(1L, "password: mysecret123");
            Page<AuditLog> page = new PageImpl<>(List.of(log));
            when(auditLogRepository.findByFilters(any(), any(), any(), any(), any(), any(Pageable.class)))
                    .thenReturn(page);

            AuditLogQuery query = new AuditLogQuery();
            PagedResponse<AuditLogResponse> result = auditLogService.queryLogs(query);

            assertThat(result.getItems().get(0).getRequestSummary()).contains("***");
            assertThat(result.getItems().get(0).getRequestSummary()).doesNotContain("mysecret123");
        }

        @Test
        @DisplayName("包含 token 的 JSON 格式请求摘要被脱敏")
        void sanitizeToken() {
            AuditLog log = buildAuditLog(1L, "\"token\": \"abc123xyz\"");
            Page<AuditLog> page = new PageImpl<>(List.of(log));
            when(auditLogRepository.findByFilters(any(), any(), any(), any(), any(), any(Pageable.class)))
                    .thenReturn(page);

            AuditLogQuery query = new AuditLogQuery();
            PagedResponse<AuditLogResponse> result = auditLogService.queryLogs(query);

            assertThat(result.getItems().get(0).getRequestSummary()).contains("***");
            assertThat(result.getItems().get(0).getRequestSummary()).doesNotContain("abc123xyz");
        }

        @Test
        @DisplayName("不包含敏感词的请求摘要不变化")
        void noSanitizeForNormalText() {
            AuditLog log = buildAuditLog(1L, "translate: hello world");
            Page<AuditLog> page = new PageImpl<>(List.of(log));
            when(auditLogRepository.findByFilters(any(), any(), any(), any(), any(), any(Pageable.class)))
                    .thenReturn(page);

            AuditLogQuery query = new AuditLogQuery();
            PagedResponse<AuditLogResponse> result = auditLogService.queryLogs(query);

            assertThat(result.getItems().get(0).getRequestSummary()).isEqualTo("translate: hello world");
        }

        @Test
        @DisplayName("null 请求摘要原样返回")
        void nullSummaryStaysNull() {
            AuditLog log = buildAuditLog(1L, null);
            log.setRequestSummary(null);
            Page<AuditLog> page = new PageImpl<>(List.of(log));
            when(auditLogRepository.findByFilters(any(), any(), any(), any(), any(), any(Pageable.class)))
                    .thenReturn(page);

            AuditLogQuery query = new AuditLogQuery();
            PagedResponse<AuditLogResponse> result = auditLogService.queryLogs(query);

            assertThat(result.getItems().get(0).getRequestSummary()).isNull();
        }
    }
}
