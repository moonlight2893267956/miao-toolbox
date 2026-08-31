package com.miao.toolbox.storage.repository;

import com.miao.toolbox.storage.entity.FileShareLinkEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FileShareLinkRepository extends JpaRepository<FileShareLinkEntity, Long> {

    /**
     * 按链接码查找分享记录
     */
    Optional<FileShareLinkEntity> findByShareCode(String shareCode);

    /**
     * 列出某用户创建的全部分享记录（按下标倒序）
     */
    List<FileShareLinkEntity> findByUserIdOrderByIdDesc(Long userId);

    /**
     * 列出某文件的全部分享记录
     */
    List<FileShareLinkEntity> findByFileId(Long fileId);

    /**
     * 判断某文件是否存在未被取消的外链分享（用于前端展示"已分享"标记）
     */
    boolean existsByFileIdAndRevokedFalse(Long fileId);

    /**
     * 删除某文件的全部分享记录（文件删除时清理）
     */
    void deleteByFileId(Long fileId);

    /**
     * 原子递增访问次数，仅当未达上限时生效。
     *
     * @return 受影响行数，0 表示已达上限（并发安全，不会超发）
     */
    @Modifying
    @Query("update FileShareLinkEntity s set s.visitCount = s.visitCount + 1 "
            + "where s.id = :id and (s.maxVisits is null or s.visitCount < s.maxVisits)")
    int incrementVisitCount(@Param("id") Long id);
}
