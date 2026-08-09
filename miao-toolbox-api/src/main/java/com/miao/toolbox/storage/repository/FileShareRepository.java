package com.miao.toolbox.storage.repository;

import com.miao.toolbox.storage.entity.FileShareEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FileShareRepository extends JpaRepository<FileShareEntity, Long> {

    /**
     * 查找文件的所有共享记录
     */
    List<FileShareEntity> findByFileId(Long fileId);

    /**
     * 查找与指定用户共享的文件
     */
    List<FileShareEntity> findBySharedWithUserId(Long sharedWithUserId);

    /**
     * 批量查找指定文件的共享记录（用于判断文件是否已共享）
     */
    List<FileShareEntity> findByFileIdIn(List<Long> fileIds);

    /**
     * 查找指定文件与指定用户的共享记录
     */
    Optional<FileShareEntity> findByFileIdAndSharedWithUserId(Long fileId, Long sharedWithUserId);

    /**
     * 检查指定文件是否与指定用户共享
     */
    boolean existsByFileIdAndSharedWithUserId(Long fileId, Long sharedWithUserId);

    /**
     * 删除指定文件的所有共享记录
     */
    void deleteByFileId(Long fileId);
}
