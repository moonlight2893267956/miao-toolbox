package com.miao.toolbox.network.controller;

import com.miao.toolbox.network.dto.NetworkToolMeta;
import com.miao.toolbox.network.service.NetworkToolService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("NetworkToolController 路由与响应格式测试")
class NetworkToolControllerTest {

    @Mock
    private NetworkToolService networkToolService;

    @InjectMocks
    private NetworkToolController networkToolController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(networkToolController).build();
    }

    @Test
    @DisplayName("GET /api/network/tools 返回 SUCCESS 与工具列表")
    void listTools_returnsOk() throws Exception {
        when(networkToolService.listTools()).thenReturn(List.of(
                NetworkToolMeta.builder()
                        .id("dns-query")
                        .name("DNS 查询工具")
                        .category("inspector")
                        .phase(2)
                        .description("查询 DNS 记录")
                        .icon("SearchOutlined")
                        .route("/tools/network/inspector/dns-query")
                        .build()
        ));

        mockMvc.perform(get("/api/network/tools"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].id").value("dns-query"))
                .andExpect(jsonPath("$.data[0].name").value("DNS 查询工具"))
                .andExpect(jsonPath("$.data[0].category").value("inspector"))
                .andExpect(jsonPath("$.data[0].phase").value(2))
                .andExpect(jsonPath("$.data[0].description").value("查询 DNS 记录"))
                .andExpect(jsonPath("$.data[0].icon").value("SearchOutlined"))
                .andExpect(jsonPath("$.data[0].route").value("/tools/network/inspector/dns-query"));
    }

    @Test
    @DisplayName("GET /api/network/tools 空列表仍返回 SUCCESS")
    void listTools_emptyList_returnsSuccess() throws Exception {
        when(networkToolService.listTools()).thenReturn(List.of());

        mockMvc.perform(get("/api/network/tools"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data").isEmpty());
    }
}
