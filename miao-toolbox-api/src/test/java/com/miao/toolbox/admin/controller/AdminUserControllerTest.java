package com.miao.toolbox.admin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.admin.dto.AdminUserResponse;
import com.miao.toolbox.admin.dto.SetRateLimitRequest;
import com.miao.toolbox.admin.dto.SetRoleRequest;
import com.miao.toolbox.admin.service.UserManageService;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.PagedResponse;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AdminUserController 单元测试")
class AdminUserControllerTest {
    private MockMvc mockMvc;

    @Mock private UserManageService userManageService;

    @InjectMocks private AdminUserController adminUserController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final User ADMIN_USER = User.builder()
            .id(1L).username("admin").role(User.Role.ADMIN)
            .isEnabled(true).loginFailCount(0).build();

    private PagedResponse<AdminUserResponse> buildUserPage() {
        AdminUserResponse resp = new AdminUserResponse();
        resp.setId(2L);
        resp.setUsername("testuser");
        resp.setRole("USER");
        resp.setIsEnabled(true);
        resp.setCreatedAt(LocalDateTime.now());

        PagedResponse<AdminUserResponse> page = new PagedResponse<>();
        page.setItems(List.of(resp));
        page.setTotal(1L);
        page.setPage(1);
        page.setPageSize(20);
        return page;
    }

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.standaloneSetup(adminUserController)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        // 在 SecurityContext 中设置 User 作为 principal
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(ADMIN_USER, null, List.of(() -> "ROLE_ADMIN"))
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("GET /api/admin/users 返回用户列表")
    void listUsers_returnsOk() throws Exception {
        when(userManageService.listUsers(1, 20)).thenReturn(buildUserPage());

        mockMvc.perform(get("/api/admin/users")
                        .param("page", "1")
                        .param("pageSize", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.items[0].username").value("testuser"));
    }

    @Test
    @DisplayName("PUT /api/admin/users/{id}/disable 禁用用户")
    void disableUser_returnsOk() throws Exception {
        mockMvc.perform(put("/api/admin/users/2/disable")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        verify(userManageService).disableUser(eq(2L), eq(1L));
    }

    @Test
    @DisplayName("PUT /api/admin/users/{id}/enable 启用用户")
    void enableUser_returnsOk() throws Exception {
        mockMvc.perform(put("/api/admin/users/2/enable")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        verify(userManageService).enableUser(eq(2L), eq(1L));
    }

    @Test
    @DisplayName("PUT /api/admin/users/{id}/role 变更角色")
    void setRole_returnsOk() throws Exception {
        SetRoleRequest request = new SetRoleRequest();
        request.setRole("ADMIN");

        mockMvc.perform(put("/api/admin/users/2/role")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        verify(userManageService).setRole(eq(2L), any(SetRoleRequest.class), eq(1L));
    }

    @Test
    @DisplayName("PUT /api/admin/users/{id}/rate-limit 设置限流")
    void setRateLimit_returnsOk() throws Exception {
        SetRateLimitRequest request = new SetRateLimitRequest();
        request.setMaxRequestsPerMinute(30);

        mockMvc.perform(put("/api/admin/users/2/rate-limit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        verify(userManageService).setRateLimit(eq(2L), any(SetRateLimitRequest.class), eq(1L));
    }
}
