package com.miao.toolbox.notification.repository;

import com.miao.toolbox.notification.entity.MessageDismissal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface MessageDismissalRepository extends JpaRepository<MessageDismissal, Long> {

    List<MessageDismissal> findByUserIdAndMessageIdIn(Long userId, Collection<Long> messageIds);

    boolean existsByUserIdAndMessageId(Long userId, Long messageId);

    void deleteByUserIdAndMessageId(Long userId, Long messageId);
}
