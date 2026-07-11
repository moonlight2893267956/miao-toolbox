package com.miao.toolbox.user.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.oauth.GitHubOAuthService;
import com.miao.toolbox.auth.oauth.GoogleOAuthService;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("UserService 单元测试")
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private GitHubOAuthService gitHubOAuthService;

    @Mock
    private GoogleOAuthService googleOAuthService;

    @InjectMocks
    private UserService userService;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(1L)
                .username("testuser")
                .passwordHash(new BCryptPasswordEncoder().encode("password123"))
                .roles(Set.of())
                .isEnabled(true)
                .mustChangePassword(false)
                .loginFailCount(0)
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .updatedAt(LocalDateTime.now(ZoneOffset.UTC))
                .build();
    }

    @Nested
    @DisplayName("获取当前用户")
    class GetCurrentUserTests {

        @Test
        @DisplayName("获取用户信息成功")
        void getCurrentUserSuccess() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            var result = userService.getCurrentUser(1L);

            assertThat(result.getId()).isEqualTo(1L);
            assertThat(result.getUsername()).isEqualTo("testuser");
            assertThat(result.getRoles()).isNotNull();
        }

        @Test
        @DisplayName("用户不存在时抛出异常")
        void userNotFound() {
            when(userRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.getCurrentUser(999L))
                    .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("获取用户信息包含 GitHub 绑定状态（未绑定）")
        void getCurrentUserWithoutGithub() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            var result = userService.getCurrentUser(1L);

            assertThat(result.getGithubId()).isNull();
            assertThat(result.getGithubUsername()).isNull();
        }

        @Test
        @DisplayName("获取用户信息包含 GitHub 绑定状态（已绑定）")
        void getCurrentUserWithGithub() {
            testUser.setGithubId("12345");
            testUser.setGithubUsername("octocat");
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            var result = userService.getCurrentUser(1L);

            assertThat(result.getGithubId()).isEqualTo("12345");
            assertThat(result.getGithubUsername()).isEqualTo("octocat");
        }
    }

    @Nested
    @DisplayName("修改密码（含旧密码校验）")
    class ChangePasswordWithVerificationTests {

        @Test
        @DisplayName("旧密码正确时修改成功")
        void changePasswordSuccess() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            userService.changePassword(1L, "password123", "newpassword456");

            verify(userRepository).save(argThat(user ->
                    new BCryptPasswordEncoder().matches("newpassword456", user.getPasswordHash())
                            && !user.getMustChangePassword()
            ));
        }

        @Test
        @DisplayName("旧密码错误时抛出异常")
        void wrongOldPassword() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            assertThatThrownBy(() -> userService.changePassword(1L, "wrongpassword", "newpassword456"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("旧密码不正确");
        }

        @Test
        @DisplayName("新密码不满足强度要求时抛出异常")
        void weakNewPassword() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            assertThatThrownBy(() -> userService.changePassword(1L, "password123", "abc"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("密码须包含字母和数字");
        }

        @Test
        @DisplayName("新密码缺少数字时抛出异常")
        void newPasswordNoDigit() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            assertThatThrownBy(() -> userService.changePassword(1L, "password123", "abcdefgh"))
                    .isInstanceOf(BusinessException.class);
        }

        @Test
        @DisplayName("新密码缺少字母时抛出异常")
        void newPasswordNoLetter() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            assertThatThrownBy(() -> userService.changePassword(1L, "password123", "12345678"))
                    .isInstanceOf(BusinessException.class);
        }
    }

    @Nested
    @DisplayName("更新基本信息")
    class UpdateProfileTests {

        @Test
        @DisplayName("用户名合法且未被占用时更新成功")
        void updateUsernameSuccess() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.findByUsername("new_user")).thenReturn(Optional.empty());
            when(userRepository.saveAndFlush(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

            var result = userService.updateProfile(1L, "new_user");

            assertThat(result.getUsername()).isEqualTo("new_user");
            verify(userRepository).saveAndFlush(argThat(user -> "new_user".equals(user.getUsername())));
        }

        @Test
        @DisplayName("用户名未变化时直接返回当前用户信息")
        void updateUsernameNoChange() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            var result = userService.updateProfile(1L, "testuser");

            assertThat(result.getUsername()).isEqualTo("testuser");
            verify(userRepository, never()).saveAndFlush(any(User.class));
        }

        @Test
        @DisplayName("用户名已存在时抛出异常")
        void updateUsernameAlreadyExists() {
            User otherUser = User.builder().id(2L).username("new_user").build();
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.findByUsername("new_user")).thenReturn(Optional.of(otherUser));

            assertThatThrownBy(() -> userService.updateProfile(1L, "new_user"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("用户名已存在");
        }

        @Test
        @DisplayName("用户名格式非法时抛出异常")
        void updateUsernameInvalidFormat() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            assertThatThrownBy(() -> userService.updateProfile(1L, "bad-name"))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("用户名只能包含");
        }
    }

    @Nested
    @DisplayName("GitHub 绑定/解绑")
    class GithubBindTests {

        @Test
        @DisplayName("未绑定时返回绑定 URL")
        void getBindGithubUrlWhenNotBound() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            when(gitHubOAuthService.buildBindAuthorizationUrl(1L)).thenReturn("https://github.com/login/oauth/authorize?client_id=test&state=mock");

            String url = userService.getBindGithubUrl(1L);

            assertThat(url).startsWith("https://github.com/login/oauth/authorize");
        }

        @Test
        @DisplayName("已绑定时抛出异常")
        void getBindGithubUrlWhenAlreadyBound() {
            testUser.setGithubId("12345");
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            assertThatThrownBy(() -> userService.getBindGithubUrl(1L))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("已绑定");
        }

        @Test
        @DisplayName("解绑成功")
        void unbindGithubSuccess() {
            testUser.setGithubId("12345");
            testUser.setGithubUsername("octocat");
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            userService.unbindGithub(1L);

            verify(userRepository).save(argThat(user ->
                    user.getGithubId() == null && user.getGithubUsername() == null
            ));
        }

        @Test
        @DisplayName("未绑定时解绑抛出异常")
        void unbindGithubWhenNotBound() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));

            assertThatThrownBy(() -> userService.unbindGithub(1L))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("未绑定");
        }
    }
}
