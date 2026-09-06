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
}
