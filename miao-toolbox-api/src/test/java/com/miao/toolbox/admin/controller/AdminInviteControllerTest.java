package com.miao.toolbox.admin.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.invite.dto.CreateInviteRequest;
import com.miao.toolbox.invite.dto.InviteResponse;
import com.miao.toolbox.invite.service.InviteService;
import java.time.LocalDateTime;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
@DisplayName("AdminInviteController 单元测试")
class AdminInviteControllerTest {

    private MockMvc mockMvc;

    @Mock private InviteService inviteService;

    @InjectMocks private AdminInviteController adminInviteController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(adminInviteController)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        User operator = User.builder().id(1L).username("admin").build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null,
                        java.util.List.of(() -> "ROLE_SUPER_ADMIN")));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("POST /api/admin/roles/{id}/invites 生成邀请链接")
    void createInvite_returnsOk() throws Exception {
        CreateInviteRequest request = new CreateInviteRequest();
        request.setExpiresInDays(7);

        InviteResponse response = InviteResponse.builder()
                .token("raw-token")
                .roleId(5L)
                .roleName("编辑")
                .roleCode("EDITOR")
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build();
        when(inviteService.createInvite(eq(5L), eq(1L), eq(7))).thenReturn(response);

        mockMvc.perform(post("/api/admin/roles/5/invites")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.token").value("raw-token"))
                .andExpect(jsonPath("$.data.roleName").value("编辑"));

        verify(inviteService).createInvite(eq(5L), eq(1L), eq(7));
    }

    @Test
    @DisplayName("POST 缺省有效期_使用默认7天")
    void createInvite_defaultExpiry() throws Exception {
        InviteResponse response = InviteResponse.builder()
                .token("raw").roleId(5L).roleName("编辑").roleCode("EDITOR")
                .expiresAt(LocalDateTime.now().plusDays(7)).build();
        when(inviteService.createInvite(eq(5L), eq(1L), any(Integer.class))).thenReturn(response);

        mockMvc.perform(post("/api/admin/roles/5/invites")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        verify(inviteService).createInvite(eq(5L), eq(1L), eq(7));
    }
}
