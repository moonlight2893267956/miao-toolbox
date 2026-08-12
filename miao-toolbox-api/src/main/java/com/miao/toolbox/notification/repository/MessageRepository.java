package com.miao.toolbox.notification.repository;

import com.miao.toolbox.notification.entity.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {

    /**
     * 查询与指定用户相关的消息（定向 + 全员广播），按创建时间倒序分页
     * 排除当前用户已 dismiss 的消息
     */
    @Query("SELECT m FROM Message m " +
           "WHERE m.id IN (" +
           "  SELECT mr.messageId FROM MessageRecipient mr WHERE mr.userId = :userId " +
           "  UNION " +
           "  SELECT mr2.messageId FROM MessageRecipient mr2 WHERE mr2.userId IS NULL" +
           ") " +
           "AND m.id NOT IN (" +
           "  SELECT md.messageId FROM MessageDismissal md WHERE md.userId = :userId" +
           ") " +
           "ORDER BY m.createdAt DESC")
    Page<Message> findUserMessages(@Param("userId") Long userId, Pageable pageable);

    /**
     * 查询与指定用户相关的消息（定向 + 全员广播），按类型过滤
     * 排除当前用户已 dismiss 的消息
     */
    @Query("SELECT m FROM Message m " +
           "WHERE m.type = :type " +
           "AND m.id IN (" +
           "  SELECT mr.messageId FROM MessageRecipient mr WHERE mr.userId = :userId " +
           "  UNION " +
           "  SELECT mr2.messageId FROM MessageRecipient mr2 WHERE mr2.userId IS NULL" +
           ") " +
           "AND m.id NOT IN (" +
           "  SELECT md.messageId FROM MessageDismissal md WHERE md.userId = :userId" +
           ") " +
           "ORDER BY m.createdAt DESC")
    Page<Message> findUserMessagesByType(@Param("userId") Long userId, @Param("type") String type, Pageable pageable);

    /**
     * 查询与指定用户相关的消息 ID 列表（用于未读计数）
     */
    @Query("SELECT m.id FROM Message m " +
           "WHERE m.id IN (" +
           "  SELECT mr.messageId FROM MessageRecipient mr WHERE mr.userId = :userId " +
           "  UNION " +
           "  SELECT mr2.messageId FROM MessageRecipient mr2 WHERE mr2.userId IS NULL" +
           ") " +
           "AND m.id NOT IN (" +
           "  SELECT md.messageId FROM MessageDismissal md WHERE md.userId = :userId" +
           ")")
    List<Long> findUserMessageIds(@Param("userId") Long userId);

    /**
     * 按类型查询消息（管理员用）
     */
    Page<Message> findByType(String type, Pageable pageable);
}
