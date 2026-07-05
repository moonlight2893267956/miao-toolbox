package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.AdminRoleResponse;
import com.miao.toolbox.admin.dto.CreateRoleRequest;
import com.miao.toolbox.admin.dto.UpdateRoleRequest;
import com.miao.toolbox.auth.entity.Role;
import com.miao.toolbox.auth.repository.RoleRepository;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AdminRoleService 单元测试")
class AdminRoleServiceTest {

    @Mock private RoleRepository roleRepository;
    @InjectMocks private AdminRoleService adminRoleService;

    private Role vipRole;
    private Role systemRole;

    @BeforeEach
    void setUp() {
        vipRole = Role.builder().id(3L).code("VIP_YONG_HU").name("VIP用户")
                .description("高级用户").isSystem(false)
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build();
        systemRole = Role.builder().id(1L).code("SUPER_ADMIN").name("超级管理员")
                .isSystem(true)
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build();
    }

    @Nested
    @DisplayName("createRole")
    class CreateTests {

        @Test
        @DisplayName("创建角色 → 角色码自动生成")
        void create_success() {
            when(roleRepository.findByCode("VIP_YONG_HU")).thenReturn(Optional.empty());
            when(roleRepository.save(any(Role.class))).thenReturn(vipRole);

            CreateRoleRequest req = new CreateRoleRequest();
            req.setName("VIP用户");
            req.setDescription("高级用户");

            AdminRoleResponse result = adminRoleService.createRole(req);

            assertThat(result.getCode()).isEqualTo("VIP_YONG_HU");
            verify(roleRepository).save(argThat(r ->
                    "VIP_YONG_HU".equals(r.getCode()) && !r.getIsSystem()));
        }

        @Test
        @DisplayName("角色码重复 → 返回 409")
        void create_duplicateCode() {
            when(roleRepository.findByCode("VIP_YONG_HU")).thenReturn(Optional.of(vipRole));

            CreateRoleRequest req = new CreateRoleRequest();
            req.setName("VIP用户");

            assertThatThrownBy(() -> adminRoleService.createRole(req))
                    .isInstanceOf(BusinessException.class);
        }
    }

    @Nested
    @DisplayName("updateRole")
    class UpdateTests {

        @Test
        @DisplayName("更新角色名称和描述")
        void update_success() {
            when(roleRepository.findById(3L)).thenReturn(Optional.of(vipRole));
            when(roleRepository.save(any(Role.class))).thenReturn(vipRole);

            UpdateRoleRequest req = new UpdateRoleRequest();
            req.setName("VIP会员");
            req.setDescription("新描述");

            AdminRoleResponse result = adminRoleService.updateRole(3L, req);

            assertThat(vipRole.getName()).isEqualTo("VIP会员");
            assertThat(vipRole.getDescription()).isEqualTo("新描述");
        }

        @Test
        @DisplayName("更新内置角色 → 422")
        void update_systemRole_throws() {
            when(roleRepository.findById(1L)).thenReturn(Optional.of(systemRole));

            UpdateRoleRequest req = new UpdateRoleRequest();
            req.setName("改名");

            assertThatThrownBy(() -> adminRoleService.updateRole(1L, req))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo("ROLE_SYSTEM_PROTECTED");
        }
    }

    @Nested
    @DisplayName("deleteRole")
    class DeleteTests {

        @Test
        @DisplayName("删除无用户角色 → 成功")
        void delete_success() {
            when(roleRepository.findById(3L)).thenReturn(Optional.of(vipRole));
            when(roleRepository.countUsersByRoleId(3L)).thenReturn(0L);

            assertThatCode(() -> adminRoleService.deleteRole(3L)).doesNotThrowAnyException();
            verify(roleRepository).delete(vipRole);
        }

        @Test
        @DisplayName("删除系统角色 → 422")
        void delete_systemRole_throws() {
            when(roleRepository.findById(1L)).thenReturn(Optional.of(systemRole));

            assertThatThrownBy(() -> adminRoleService.deleteRole(1L))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo("ROLE_SYSTEM_PROTECTED");
        }

        @Test
        @DisplayName("删除有关联用户的角色 → 422")
        void delete_roleWithUsers_throws() {
            when(roleRepository.findById(3L)).thenReturn(Optional.of(vipRole));
            when(roleRepository.countUsersByRoleId(3L)).thenReturn(5L);

            assertThatThrownBy(() -> adminRoleService.deleteRole(3L))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo("ROLE_HAS_USERS");
        }
    }

    @Nested
    @DisplayName("generateRoleCode")
    class CodeGenTests {

        @Test
        @DisplayName("英文名 → 大写")
        void englishName() {
            assertThat(AdminRoleService.generateRoleCode("VIP")).isEqualTo("VIP");
        }

        @Test
        @DisplayName("中文名 → 拼音")
        void chineseName() {
            assertThat(AdminRoleService.generateRoleCode("超级管理员")).isEqualTo("CHAO_JI_GUAN_LI_YUAN");
        }

        @Test
        @DisplayName("混合名 → 混合")
        void mixedName() {
            assertThat(AdminRoleService.generateRoleCode("VIP用户")).isEqualTo("VIP_YONG_HU");
        }
    }
}
