package com.miao.toolbox.storage.repository;

import com.miao.toolbox.storage.entity.FileEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FileRepository extends JpaRepository<FileEntity, Long> {

    /**
     * 查找用户指定目录下的文件（分页）
     */
    Page<FileEntity> findByUserIdAndPath(Long userId, String path, Pageable pageable);

    /**
     * 查找用户指定目录下的所有文件（不分页）
     */
    List<FileEntity> findByUserIdAndPath(Long userId, String path);

    /**
     * 查找用户所有文件（分页）
     */
    Page<FileEntity> findByUserId(Long userId, Pageable pageable);

    /**
     * 按 COS key 查找文件
     */
    Optional<FileEntity> findByCosKey(String cosKey);

    /**
     * 查找用户指定目录下指定文件名的文件
     */
    List<FileEntity> findByUserIdAndPathAndFileName(Long userId, String path, String fileName);

    /**
     * 检查用户指定目录下是否存在同名文件（废纸篓恢复时的冲突检查）
     */
    boolean existsByUserIdAndPathAndFileName(Long userId, String path, String fileName);

    /**
     * 批量校验 COS key 是否存在数据库记录（用于孤立文件清理任务）
     *
     * ⚠️ 必须 native：FileEntity 带 @SQLRestriction(deleted_at IS NULL)，
     * JPQL 会把废纸篓中的文件排除，导致清理任务误删其 COS 对象、恢复后内容丢失。
     *
     * @param keys COS key 集合
     * @return 存在记录的 COS key 子集
     */
    @Query(value = "SELECT cos_key FROM files WHERE cos_key IN (:keys)", nativeQuery = true)
    List<String> findExistingCosKeys(@Param("keys") java.util.Collection<String> keys);

    /**
     * 模糊搜索文件名（忽略大小写）
     */
    Page<FileEntity> findByUserIdAndFileNameContainingIgnoreCase(Long userId, String keyword, Pageable pageable);

    /**
     * 统计用户文件数量
     */
    long countByUserId(Long userId);

    /**
     * 统计用户已用存储空间
     */
    @Query("SELECT COALESCE(SUM(f.sizeBytes), 0) FROM FileEntity f WHERE f.userId = :userId")
    long sumSizeBytesByUserId(@Param("userId") Long userId);

    /**
     * 查找用户指定路径前缀下的所有文件（用于目录删除时级联删除）
     */
    @Query("SELECT f FROM FileEntity f WHERE f.userId = :userId AND (f.path = :path OR f.path LIKE CONCAT(:path, '/%'))")
    List<FileEntity> findByUserIdAndPathPrefix(@Param("userId") Long userId, @Param("path") String path);

    /**
     * 删除用户指定路径前缀下的所有文件
     */
    @Modifying
    @Query("DELETE FROM FileEntity f WHERE f.userId = :userId AND (f.path = :path OR f.path LIKE CONCAT(:path, '/%'))")
    int deleteByUserIdAndPathPrefix(@Param("userId") Long userId, @Param("path") String path);

    /**
     * 检查文件是否属于指定用户
     */
    boolean existsByIdAndUserId(Long id, Long userId);

    // ===== 自定义排序（「自定义」排序模式）=====

    /**
     * 目录当前最大自定义排序序号（新文件追加到末尾用）
     */
    @Query("SELECT COALESCE(MAX(f.customOrder), 0) FROM FileEntity f WHERE f.userId = :userId AND f.path = :path")
    int findMaxCustomOrder(@Param("userId") Long userId, @Param("path") String path);

    /**
     * 更新单个文件的自定义排序序号。
     * 用批量 UPDATE 而非实体 save，避免触发 @PreUpdate 刷新 updated_at——
     * 调整顺序不是内容修改，不应改变「修改时间」排序的结果。
     */
    @Modifying
    @Query("UPDATE FileEntity f SET f.customOrder = :sortOrder WHERE f.id = :id AND f.userId = :userId")
    int updateCustomOrderById(@Param("id") Long id, @Param("userId") Long userId, @Param("sortOrder") int sortOrder);

    /**
     * 查找指定用户的指定文件
     */
    Optional<FileEntity> findByIdAndUserId(Long id, Long userId);

    // ===== 管理员聚合查询 =====

    /**
     * 全局总存储用量
     */
    @Query("SELECT COALESCE(SUM(f.sizeBytes), 0) FROM FileEntity f")
    long sumTotalSizeBytes();

    /**
     * 全局文件总数
     */
    @Override
    long count();

    /**
     * 按用户分组统计存储用量
     */
    @Query("SELECT f.userId, COALESCE(SUM(f.sizeBytes), 0) FROM FileEntity f GROUP BY f.userId")
    List<Object[]> sumSizeBytesGroupByUserId();

    /**
     * 按用户分组统计文件数量
     */
    @Query("SELECT f.userId, COUNT(f) FROM FileEntity f GROUP BY f.userId")
    List<Object[]> countGroupByUserId();

    /**
     * 按 MIME 前缀分组统计文件数量和总大小
     */
    @Query("SELECT f.mimeType, COUNT(f), COALESCE(SUM(f.sizeBytes), 0) FROM FileEntity f GROUP BY f.mimeType")
    List<Object[]> statsGroupByMimeType();

    // ==================== 废纸篓（V32 软删除） ====================
    // ⚠️ Hibernate 7 的 @SQLRestriction 会附加到 JPQL bulk UPDATE/DELETE 上
    // （实测：restore 的 UPDATE 被加上 deleted_at IS NULL 而永远 0 行），
    // 因此废纸篓的读写全部使用 native SQL，确保不被 restriction 污染。

    /** 查找废纸篓中的单个文件（native 绕过 @SQLRestriction） */
    @Query(value = "SELECT * FROM files WHERE id = :id AND user_id = :userId AND deleted_at IS NOT NULL", nativeQuery = true)
    Optional<FileEntity> findDeletedById(@Param("userId") Long userId, @Param("id") Long id);

    /** 废纸篓顶层文件（path 不在已删除目录前缀下） */
    @Query(value = "SELECT * FROM files WHERE user_id = :userId AND deleted_at IS NOT NULL AND path NOT LIKE '__trash/%' ORDER BY deleted_at DESC", nativeQuery = true)
    List<FileEntity> findDeletedTopByUserId(@Param("userId") Long userId);

    /** 全部已删除文件（含目录子树内的，供清空/过期清理用） */
    @Query(value = "SELECT * FROM files WHERE user_id = :userId AND deleted_at IS NOT NULL", nativeQuery = true)
    List<FileEntity> findDeletedByUserId(@Param("userId") Long userId);

    /** 已删除目录子树内的文件实体（彻底删除目录时收集分享链接/COS key） */
    @Query(value = "SELECT * FROM files WHERE user_id = :userId "
            + "AND (path = :trashPath OR path LIKE CONCAT(:trashPath, '/%')) AND deleted_at IS NOT NULL", nativeQuery = true)
    List<FileEntity> findDeletedByPathPrefix(@Param("userId") Long userId, @Param("trashPath") String trashPath);

    /** 全库超期已删除文件（30 天自动清理） */
    @Query(value = "SELECT * FROM files WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff", nativeQuery = true)
    List<FileEntity> findExpiredBefore(@Param("cutoff") java.time.LocalDateTime cutoff);

    /** 全库超期已删除文件的 COS key（30 天自动清理时删除对象） */
    @Query(value = "SELECT cos_key FROM files WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff", nativeQuery = true)
    List<String> findExpiredCosKeys(@Param("cutoff") java.time.LocalDateTime cutoff);

    /** 单文件软删除进废纸篓（path 不迁移：files 无 path 唯一约束） */
    @Modifying
    @Query(value = "UPDATE files SET deleted_at = :ts WHERE id = :id AND user_id = :userId", nativeQuery = true)
    int moveToTrashById(@Param("userId") Long userId, @Param("id") Long id, @Param("ts") java.time.LocalDateTime ts);

    /** 目录删除时：整棵子树的文件 path 迁移到 __trash/{dirId}/ 前缀下并标记删除 */
    @Modifying
    @Query(value = "UPDATE files SET deleted_at = :ts, path = CONCAT(:trashPrefix, path) "
            + "WHERE user_id = :userId AND (path = :path OR path LIKE CONCAT(:path, '/%'))", nativeQuery = true)
    int moveToTrashByPathPrefix(@Param("userId") Long userId, @Param("path") String path,
                                @Param("trashPrefix") String trashPrefix, @Param("ts") java.time.LocalDateTime ts);

    /** 恢复文件（清除标记） */
    @Modifying
    @Query(value = "UPDATE files SET deleted_at = NULL WHERE id = :id AND user_id = :userId", nativeQuery = true)
    int restoreById(@Param("userId") Long userId, @Param("id") Long id);

    /** 恢复目录子树内的文件：path 去掉 __trash 前缀并清除标记 */
    @Modifying
    @Query(value = "UPDATE files SET deleted_at = NULL, path = SUBSTRING(path, :prefixLen) "
            + "WHERE user_id = :userId AND (path = :trashPath OR path LIKE CONCAT(:trashPath, '/%'))", nativeQuery = true)
    int restoreByTrashPathPrefix(@Param("userId") Long userId, @Param("trashPath") String trashPath,
                                 @Param("prefixLen") int prefixLen);

    /** 物理删除单个已删除文件（废纸篓彻底删除用） */
    @Modifying
    @Query(value = "DELETE FROM files WHERE id = :id AND user_id = :userId", nativeQuery = true)
    int deleteHardById(@Param("userId") Long userId, @Param("id") Long id);

    /** 物理删除用户全部已删除文件（清空废纸篓） */
    @Modifying
    @Query(value = "DELETE FROM files WHERE user_id = :userId AND deleted_at IS NOT NULL", nativeQuery = true)
    int deleteAllDeletedByUserId(@Param("userId") Long userId);

    /** 物理删除超期已删除文件（30 天自动清理） */
    @Modifying
    @Query(value = "DELETE FROM files WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff", nativeQuery = true)
    int deleteAllExpiredBefore(@Param("cutoff") java.time.LocalDateTime cutoff);

    /** 已删除子树内文件的 COS key（彻底删除目录时清理对象） */
    @Query(value = "SELECT cos_key FROM files WHERE user_id = :userId "
            + "AND (path = :trashPath OR path LIKE CONCAT(:trashPath, '/%')) AND deleted_at IS NOT NULL", nativeQuery = true)
    List<String> findDeletedCosKeysByPathPrefix(@Param("userId") Long userId, @Param("trashPath") String trashPath);

    /** 全部已删除文件的 COS key（清空废纸篓） */
    @Query(value = "SELECT cos_key FROM files WHERE user_id = :userId AND deleted_at IS NOT NULL", nativeQuery = true)
    List<String> findDeletedCosKeysByUserId(@Param("userId") Long userId);

    /** 已删除子树内文件总大小（彻底删除目录时回退配额） */
    @Query(value = "SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE user_id = :userId "
            + "AND (path = :trashPath OR path LIKE CONCAT(:trashPath, '/%')) AND deleted_at IS NOT NULL", nativeQuery = true)
    long sumDeletedSizeByPathPrefix(@Param("userId") Long userId, @Param("trashPath") String trashPath);

    /** 全部已删除文件总大小（清空废纸篓时回退配额） */
    @Query(value = "SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE user_id = :userId AND deleted_at IS NOT NULL", nativeQuery = true)
    long sumDeletedSizeByUserId(@Param("userId") Long userId);

    /** 超期已删除文件按用户分组的大小（30 天清理时回退配额） */
    @Query(value = "SELECT user_id, COALESCE(SUM(size_bytes), 0) FROM files "
            + "WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff GROUP BY user_id", nativeQuery = true)
    List<Object[]> sumExpiredSizeGroupByUser(@Param("cutoff") java.time.LocalDateTime cutoff);

    /** 重命名/移动目录时级联更新子树文件路径（native：覆盖含软删子树，不受 restriction 影响） */
    @Modifying
    @Query(value = "UPDATE files SET path = CONCAT(:newPath, SUBSTRING(path, LENGTH(:oldPath) + 1)) "
            + "WHERE user_id = :userId AND path LIKE CONCAT(:oldPath, '/%')", nativeQuery = true)
    int cascadePathPrefix(@Param("userId") Long userId, @Param("oldPath") String oldPath, @Param("newPath") String newPath);
}
