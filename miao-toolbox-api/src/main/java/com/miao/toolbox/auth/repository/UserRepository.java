package com.miao.toolbox.auth.repository;

import com.miao.toolbox.auth.entity.User;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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

    Optional<User> findByEmailAndEmailVerifiedTrue(String email);

    boolean existsByUsername(String username);

    /**
     * 分页搜索用户（用户名或邮箱模糊匹配，用于共享功能选择目标用户）。
     */
    Page<User> findByUsernameContainingIgnoreCaseOrEmailContainingIgnoreCase(
            String username, String email, Pageable pageable);

    /**
     * 原子增加用户存储用量，配额不足时更新不生效（返回 0）。
     * <p>
     * 通过数据库行级条件保证配额检查与更新的原子性，避免并发上传互相覆盖。
     *
     * @return 受影响行数（0 表示配额不足）
     */
    @Modifying
    @Query("UPDATE User u SET u.storageUsedBytes = u.storageUsedBytes + :delta "
            + "WHERE u.id = :userId AND u.storageUsedBytes + :delta <= u.storageQuotaBytes")
    int incrementStorageUsedWithQuotaCheck(@Param("userId") Long userId, @Param("delta") long delta);

    /**
     * 原子减少用户存储用量，下限为 0。
     */
    @Modifying
    @Query("UPDATE User u SET u.storageUsedBytes = "
            + "CASE WHEN u.storageUsedBytes - :delta < 0 THEN 0 ELSE u.storageUsedBytes - :delta END "
            + "WHERE u.id = :userId")
    int decrementStorageUsed(@Param("userId") Long userId, @Param("delta") long delta);

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
