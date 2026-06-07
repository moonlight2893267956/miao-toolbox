package com.miao.toolbox.admin.controller;

import com.miao.toolbox.admin.dto.AuditLogQuery;
import com.miao.toolbox.admin.dto.AuditLogResponse;
import com.miao.toolbox.admin.service.AuditLogService;
import com.miao.toolbox.common.response.PagedResponse;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AdminLogController 单元测试")
class AdminLogControllerTest {

    private MockMvc mockMvc;

    @Mock
    private AuditLogService auditLogService;

    @InjectMocks
    private AdminLogController adminLogController;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.standaloneSetup(adminLogController)
                .setCustomArgumentResolvers(new PageableHandlerMethodArgumentResolver())
                .build();
    }

    @Test
    @DisplayName("GET /api/admin/logs 返回分页日志")
    void queryLogsReturnsPagedResult() throws Exception {
        AuditLogResponse resp = new AuditLogResponse();
        resp.setId(1L);
        resp.setUserId(1L);
        resp.setToolId("translation");
        resp.setRequestSummary("translate hello");
        resp.setResponseStatus("SUCCESS");
        resp.setDurationMs(120);
        resp.setTokenConsumption(50);
        resp.setCreatedAt(LocalDateTime.now());

        PagedResponse<AuditLogResponse> paged = new PagedResponse<>();
        paged.setItems(List.of(resp));
        paged.setTotal(1);
        paged.setPage(1);
        paged.setPageSize(20);

        when(auditLogService.queryLogs(any(AuditLogQuery.class))).thenReturn(paged);

        mockMvc.perform(get("/api/admin/logs")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].toolId").value("translation"))
                .andExpect(jsonPath("$.data.total").value(1));
    }

    @Test
    @DisplayName("GET /api/admin/logs 支持筛选参数")
    void queryLogsWithFilters() throws Exception {
        PagedResponse<AuditLogResponse> paged = new PagedResponse<>();
        paged.setItems(List.of());
        paged.setTotal(0);
        paged.setPage(1);
        paged.setPageSize(20);

        when(auditLogService.queryLogs(any(AuditLogQuery.class))).thenReturn(paged);

        mockMvc.perform(get("/api/admin/logs")
                        .param("userId", "1")
                        .param("toolId", "translation")
                        .param("responseStatus", "SUCCESS")
                        .param("page", "1")
                        .param("pageSize", "10")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isEmpty());
    }
}
