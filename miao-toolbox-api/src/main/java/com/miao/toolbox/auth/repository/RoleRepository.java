package com.miao.toolbox.auth.repository;

import com.miao.toolbox.auth.entity.Role;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.Set;

@Repository
public interface RoleRepository extends JpaRepository<Role, Long> {

    Optional<Role> findByCode(String code);

    boolean existsByName(String name);

    Page<Role> findByNameContaining(String name, Pageable pageable);

    /**
     * 统计关联到指定角色的用户数量。
     */
    @Query(value = "SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = :roleId", nativeQuery = true)
    long countUsersByRoleId(@Param("roleId") Long roleId);

    /**
     * 查询用户关联的所有角色 ID（不触发 LAZY 加载）。
     */
    @Query(value = "SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = :userId", nativeQuery = true)
    Set<Long> findIdsByUserId(@Param("userId") Long userId);

    /**
     * 检查给定角色 ID 集合中是否有任意角色拥有指定路由的访问权限。
     */
    @Query(value = "SELECT COUNT(rr.id) > 0 FROM role_routes rr WHERE rr.role_id IN :roleIds AND rr.route_id = :routeId", nativeQuery = true)
    boolean existsRouteAccessByRoleIds(@Param("roleIds") Set<Long> roleIds, @Param("routeId") Long routeId);
}
