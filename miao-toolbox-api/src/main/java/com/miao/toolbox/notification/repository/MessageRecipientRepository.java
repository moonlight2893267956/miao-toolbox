package com.miao.toolbox.notification.repository;

import com.miao.toolbox.notification.entity.MessageRecipient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MessageRecipientRepository extends JpaRepository<MessageRecipient, Long> {

    List<MessageRecipient> findByMessageId(Long messageId);

    boolean existsByMessageIdAndUserId(Long messageId, Long userId);

    /**
     * 查询全员广播的接收记录（user_id IS NULL）
     */
    List<MessageRecipient> findByMessageIdAndUserIdIsNull(Long messageId);
}
