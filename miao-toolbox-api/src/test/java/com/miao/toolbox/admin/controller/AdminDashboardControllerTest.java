package com.miao.toolbox.admin.controller;

import com.miao.toolbox.admin.dto.DashboardStatsResponse;
import com.miao.toolbox.admin.service.DashboardService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AdminDashboardController 单元测试")
class AdminDashboardControllerTest {

    private MockMvc mockMvc;

    @Mock
    private DashboardService dashboardService;

    @InjectMocks
    private AdminDashboardController adminDashboardController;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.standaloneSetup(adminDashboardController).build();
    }

    @Test
    @DisplayName("GET /api/admin/dashboard/stats 返回统计数据")
    void getStatsReturnsData() throws Exception {
        DashboardStatsResponse stats = new DashboardStatsResponse();
        stats.setTodayTotalCalls(100);
        stats.setTodayErrorCalls(5);
        stats.setOnlineUsers(10);
        stats.setTotalUsers(50);

        when(dashboardService.getStats()).thenReturn(stats);

        mockMvc.perform(get("/api/admin/dashboard/stats")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.todayTotalCalls").value(100))
                .andExpect(jsonPath("$.data.todayErrorCalls").value(5))
                .andExpect(jsonPath("$.data.onlineUsers").value(10))
                .andExpect(jsonPath("$.data.totalUsers").value(50));
    }
}
