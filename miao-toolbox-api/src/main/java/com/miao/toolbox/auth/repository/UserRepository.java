package com.miao.toolbox.auth.repository;

import com.miao.toolbox.auth.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    Optional<User> findByGithubId(String githubId);

    Optional<User> findByGoogleId(String googleId);

    Optional<User> findByEmail(String email);

    boolean existsByUsername(String username);

    /**
     * 统计拥有指定角色码的用户数量（通过 user_roles + roles 联表）。
     */
    @Query(value = "SELECT COUNT(DISTINCT ur.user_id) FROM user_roles ur INNER JOIN roles r ON ur.role_id = r.id WHERE r.code = :roleCode", nativeQuery = true)
    long countByRolesCode(@Param("roleCode") String roleCode);

    /**
     * 分页查询用户并 JOIN FETCH 预加载 roles，避免 N+1 查询。
     */
    @Query(value = "SELECT DISTINCT u FROM User u LEFT JOIN FETCH u.roles",
           countQuery = "SELECT COUNT(u) FROM User u")
    Page<User> findAllWithRoles(Pageable pageable);
}
