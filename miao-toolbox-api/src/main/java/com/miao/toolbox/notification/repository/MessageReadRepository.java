package com.miao.toolbox.notification.repository;

import com.miao.toolbox.notification.entity.MessageRead;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Set;

@Repository
public interface MessageReadRepository extends JpaRepository<MessageRead, Long> {

    boolean existsByMessageIdAndUserId(Long messageId, Long userId);

    List<MessageRead> findByUserIdAndMessageIdIn(Long userId, Set<Long> messageIds);

    /**
     * 统计指定用户已读的消息数量（在给定消息 ID 集合中）
     */
    long countByUserIdAndMessageIdIn(Long userId, Set<Long> messageIds);
}
