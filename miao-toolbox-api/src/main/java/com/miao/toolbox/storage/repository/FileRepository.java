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
}
