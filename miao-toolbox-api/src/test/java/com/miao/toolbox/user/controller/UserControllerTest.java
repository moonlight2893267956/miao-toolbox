package com.miao.toolbox.user.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.user.dto.UpdateProfileRequest;
import com.miao.toolbox.user.dto.UserInfoResponse;
import com.miao.toolbox.user.service.UserService;
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

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("UserController 单元测试")
class UserControllerTest {

    private MockMvc mockMvc;

    @Mock
    private UserService userService;

    @InjectMocks
    private UserController userController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final User CURRENT_USER = User.builder()
            .id(1L)
            .username("testuser")
            .isEnabled(true)
            .loginFailCount(0)
            .build();

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.standaloneSetup(userController)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(CURRENT_USER, null, List.of())
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("PUT /api/users/me/profile 更新用户名")
    void updateProfileReturnsUpdatedUser() throws Exception {
        UpdateProfileRequest request = new UpdateProfileRequest();
        request.setUsername("new_user");
        when(userService.updateProfile(1L, "new_user")).thenReturn(UserInfoResponse.builder()
                .id(1L)
                .username("new_user")
                .roles(List.of())
                .mustChangePassword(false)
                .build());

        mockMvc.perform(put("/api/users/me/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.username").value("new_user"));

        verify(userService).updateProfile(eq(1L), eq("new_user"));
    }

    @Test
    @DisplayName("PUT /api/users/me/profile 未认证时返回 401")
    void updateProfileUnauthenticated() throws Exception {
        SecurityContextHolder.clearContext();
        UpdateProfileRequest request = new UpdateProfileRequest();
        request.setUsername("new_user");

        mockMvc.perform(put("/api/users/me/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }
}
