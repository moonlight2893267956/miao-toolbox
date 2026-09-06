package com.miao.toolbox.storage.repository;

import com.miao.toolbox.storage.entity.DirectoryEntity;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DirectoryRepository extends JpaRepository<DirectoryEntity, Long> {

    /**
     * 查找用户指定父目录下的子目录
     */
    List<DirectoryEntity> findByUserIdAndParentPath(Long userId, String parentPath);

    /**
     * 查找用户指定父目录下的子目录（Story 5.5：支持排序）
     */
    List<DirectoryEntity> findByUserIdAndParentPath(Long userId, String parentPath, Sort sort);

    /**
     * 父目录下当前最大自定义排序序号（新建目录追加到末尾用）
     */
    @Query("SELECT COALESCE(MAX(d.customOrder), 0) FROM DirectoryEntity d WHERE d.userId = :userId AND d.parentPath = :parentPath")
    int findMaxCustomOrder(@Param("userId") Long userId, @Param("parentPath") String parentPath);

    /**
     * 更新单个目录的自定义排序序号。
     * 用批量 UPDATE 而非实体 save，避免触发 @PrePersist/更新 created_at——
     * 调整顺序不是内容修改，不应影响创建时间。
     */
    @Modifying
    @Query("UPDATE DirectoryEntity d SET d.customOrder = :sortOrder WHERE d.id = :id AND d.userId = :userId")
    int updateCustomOrderById(@Param("id") Long id, @Param("userId") Long userId, @Param("sortOrder") int sortOrder);

    /**
     * 查找用户全部目录
     */
    List<DirectoryEntity> findByUserIdOrderByPathAsc(Long userId);

    /**
     * 查找用户指定路径的目录
     */
    Optional<DirectoryEntity> findByUserIdAndPath(Long userId, String path);

    /**
     * 检查用户指定路径的目录是否存在
     */
    boolean existsByUserIdAndPath(Long userId, String path);

    /**
     * 查找用户指定路径前缀下的所有目录（用于级联删除）
     */
    @Query("SELECT d FROM DirectoryEntity d WHERE d.userId = :userId AND (d.path = :path OR d.path LIKE CONCAT(:path, '/%'))")
    List<DirectoryEntity> findByUserIdAndPathPrefix(@Param("userId") Long userId, @Param("path") String path);

    /**
     * 删除用户指定路径前缀下的所有目录
     */
    @Modifying
    @Query("DELETE FROM DirectoryEntity d WHERE d.userId = :userId AND (d.path = :path OR d.path LIKE CONCAT(:path, '/%'))")
    int deleteByUserIdAndPathPrefix(@Param("userId") Long userId, @Param("path") String path);

    /**
     * 检查目录是否属于指定用户
     */
    boolean existsByIdAndUserId(Long id, Long userId);

    // ==================== 废纸篓（V32 软删除） ====================
    // ⚠️ Hibernate 7 的 @SQLRestriction 会附加到 JPQL bulk UPDATE/DELETE 上
    // （实测：restore 的 UPDATE 被加上 deleted_at IS NULL 而永远 0 行），
    // 因此废纸篓的读写全部使用 native SQL，确保不被 restriction 污染。
    // 目录 UNIQUE (user_id, path)：软删除时整棵子树 path/parent_path 迁移到
    // "__trash/{dirId}/" 前缀下释放原路径，恢复时按前缀还原。

    /** 查找废纸篓中的单个目录（native 绕过 @SQLRestriction） */
    @Query(value = "SELECT * FROM directories WHERE id = :id AND user_id = :userId AND deleted_at IS NOT NULL", nativeQuery = true)
    Optional<DirectoryEntity> findDeletedById(@Param("userId") Long userId, @Param("id") Long id);

    /** 废纸篓顶层目录（parent_path 不带 __trash 前缀；子孙随顶层一起展示/恢复） */
    @Query(value = "SELECT * FROM directories WHERE user_id = :userId AND deleted_at IS NOT NULL AND parent_path NOT LIKE '__trash/%' ORDER BY deleted_at DESC", nativeQuery = true)
    List<DirectoryEntity> findDeletedTopByUserId(@Param("userId") Long userId);

    /** 指定路径的目录是否在废纸篓中（恢复文件时检查其所在目录状态） */
    @Query(value = "SELECT COUNT(*) > 0 FROM directories WHERE user_id = :userId AND path = :path AND deleted_at IS NOT NULL", nativeQuery = true)
    boolean existsDeletedByPath(@Param("userId") Long userId, @Param("path") String path);

    /** 目录自身软删除：标记删除并把 path 迁移到 __trash 前缀（parent_path 保留原父，恢复时直接回原位） */
    @Modifying
    @Query(value = "UPDATE directories SET deleted_at = :ts, path = CONCAT(:trashPrefix, path) "
            + "WHERE id = :id AND user_id = :userId", nativeQuery = true)
    int moveToTrashSelf(@Param("userId") Long userId, @Param("id") Long id,
                        @Param("trashPrefix") String trashPrefix, @Param("ts") java.time.LocalDateTime ts);

    /** 子孙目录软删除：path 与 parent_path 都加 __trash 前缀 */
    @Modifying
    @Query(value = "UPDATE directories SET deleted_at = :ts, "
            + "path = CONCAT(:trashPrefix, path), parent_path = CONCAT(:trashPrefix, parent_path) "
            + "WHERE user_id = :userId AND path LIKE CONCAT(:path, '/%')", nativeQuery = true)
    int moveToTrashSubDirs(@Param("userId") Long userId, @Param("path") String path,
                           @Param("trashPrefix") String trashPrefix, @Param("ts") java.time.LocalDateTime ts);

    /** 恢复目录自身：path 去掉 __trash 前缀并清除标记 */
    @Modifying
    @Query(value = "UPDATE directories SET deleted_at = NULL, path = SUBSTRING(path, :prefixLen) "
            + "WHERE id = :id AND user_id = :userId", nativeQuery = true)
    int restoreSelf(@Param("userId") Long userId, @Param("id") Long id, @Param("prefixLen") int prefixLen);

    /** 恢复子孙目录：path 与 parent_path 去掉 __trash 前缀并清除标记 */
    @Modifying
    @Query(value = "UPDATE directories SET deleted_at = NULL, "
            + "path = SUBSTRING(path, :prefixLen), parent_path = SUBSTRING(parent_path, :prefixLen) "
            + "WHERE user_id = :userId AND path LIKE CONCAT(:trashPath, '/%')", nativeQuery = true)
    int restoreSubDirs(@Param("userId") Long userId, @Param("trashPath") String trashPath, @Param("prefixLen") int prefixLen);

    /** 物理删除用户全部已删除目录（清空废纸篓） */
    @Modifying
    @Query(value = "DELETE FROM directories WHERE user_id = :userId AND deleted_at IS NOT NULL", nativeQuery = true)
    int deleteAllDeletedByUserId(@Param("userId") Long userId);

    /** 物理删除超期已删除目录（30 天自动清理） */
    @Modifying
    @Query(value = "DELETE FROM directories WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff", nativeQuery = true)
    int deleteAllExpiredBefore(@Param("cutoff") java.time.LocalDateTime cutoff);

    /** 重命名/移动目录时级联更新子孙目录路径（native：覆盖含软删子树，不受 restriction 影响） */
    @Modifying
    @Query(value = "UPDATE directories SET "
            + "path = CONCAT(:newPath, SUBSTRING(path, LENGTH(:oldPath) + 1)), "
            + "parent_path = CONCAT(:newPath, SUBSTRING(parent_path, LENGTH(:oldPath) + 1)) "
            + "WHERE user_id = :userId AND path LIKE CONCAT(:oldPath, '/%')", nativeQuery = true)
    int cascadePathPrefix(@Param("userId") Long userId, @Param("oldPath") String oldPath, @Param("newPath") String newPath);
}
