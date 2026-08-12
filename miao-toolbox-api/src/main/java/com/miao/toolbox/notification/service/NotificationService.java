package com.miao.toolbox.notification.service;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.notification.controller.AdminMessageController;
import com.miao.toolbox.notification.dto.MessageDetailResponse;
import com.miao.toolbox.notification.dto.MessageResponse;
import com.miao.toolbox.notification.dto.SendMessageRequest;
import com.miao.toolbox.notification.dto.UnreadCountResponse;
import com.miao.toolbox.notification.entity.MessageDismissal;
import com.miao.toolbox.notification.entity.Message;
import com.miao.toolbox.notification.entity.MessageRead;
import com.miao.toolbox.notification.entity.MessageRecipient;
import com.miao.toolbox.notification.repository.MessageDismissalRepository;
import com.miao.toolbox.notification.repository.MessageReadRepository;
import com.miao.toolbox.notification.repository.MessageRecipientRepository;
import com.miao.toolbox.notification.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final MessageRepository messageRepository;
    private final MessageRecipientRepository messageRecipientRepository;
    private final MessageReadRepository messageReadRepository;
    private final MessageDismissalRepository messageDismissalRepository;
    private final UserRepository userRepository;

    // ==================== 便捷方法 ====================

    /**
     * 向指定用户发送系统通知
     */
    @Transactional
    public Message createSystemNotification(Long userId, String title, String content) {
        SendMessageRequest request = SendMessageRequest.builder()
                .title(title)
                .content(content)
                .type(Message.TYPE_SYSTEM)
                .priority(Message.PRIORITY_NORMAL)
                .userIds(List.of(userId))
                .build();
        return sendMessage(request, null);
    }

    /**
     * 向指定用户发送安全通知
     */
    @Transactional
    public Message createSecurityNotification(Long userId, String title, String content) {
        SendMessageRequest request = SendMessageRequest.builder()
                .title(title)
                .content(content)
                .type(Message.TYPE_SECURITY)
                .priority(Message.PRIORITY_HIGH)
                .userIds(List.of(userId))
                .build();
        return sendMessage(request, null);
    }

    /**
     * 向指定用户发送工具结果通知（v1 预留）
     */
    @Transactional
    public Message createToolResultNotification(Long userId, String title, String content,
                                                 String toolId, String toolOperationId) {
        Message message = Message.builder()
                .title(title)
                .content(content)
                .type(Message.TYPE_TOOL)
                .priority(Message.PRIORITY_NORMAL)
                .senderId(null)
                .toolId(toolId)
                .toolOperationId(toolOperationId)
                .build();
        messageRepository.save(message);

        MessageRecipient recipient = MessageRecipient.builder()
                .messageId(message.getId())
                .userId(userId)
                .build();
        messageRecipientRepository.save(recipient);

        return message;
    }

    // ==================== 发送消息 ====================

    /**
     * 发送消息（定向用户或全员广播）
     */
    @Transactional
    public Message sendMessage(SendMessageRequest request, Long senderId) {
        // 校验：定向发送但未选任何用户
        boolean isTargeted = "TARGETED".equalsIgnoreCase(request.getScope());
        if (isTargeted && (request.getUserIds() == null || request.getUserIds().isEmpty())) {
            throw new BusinessException(ErrorCode.MSG_NO_RECIPIENTS, "请选择至少一个接收用户", 400);
        }

        Message message = Message.builder()
                .title(request.getTitle())
                .content(request.getContent())
                .type(request.getType() != null ? request.getType() : Message.TYPE_SYSTEM)
                .priority(request.getPriority() != null ? request.getPriority() : Message.PRIORITY_NORMAL)
                .senderId(senderId)
                .build();
        message = messageRepository.save(message);

        if (isTargeted && request.getUserIds() != null && !request.getUserIds().isEmpty()) {
            // 定向发送
            for (Long userId : request.getUserIds()) {
                MessageRecipient recipient = MessageRecipient.builder()
                        .messageId(message.getId())
                        .userId(userId)
                        .build();
                messageRecipientRepository.save(recipient);
            }
        } else {
            // 全员广播：user_id = NULL
            MessageRecipient broadcast = MessageRecipient.builder()
                    .messageId(message.getId())
                    .userId(null)
                    .build();
            messageRecipientRepository.save(broadcast);
        }

        log.info("消息已发送: id={}, type={}, senderId={}, 定向={}",
                message.getId(), message.getType(), senderId, isTargeted);
        return message;
    }

    // ==================== 查询消息列表 ====================

    /**
     * 查询用户消息列表（分页）
     * @param readStatus 已读状态筛选：null=全部, "unread"=未读, "read"=已读
     */
    @Transactional(readOnly = true)
    public PagedResponse<MessageResponse> listMessages(Long userId, int page, int pageSize, String type, String readStatus) {
        int safePage = Math.max(page, 1) - 1;
        int safePageSize = Math.min(Math.max(pageSize, 1), 100);

        PageRequest pageRequest = PageRequest.of(safePage, safePageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Message> messagePage;

        if (type != null && !type.isBlank()) {
            messagePage = messageRepository.findUserMessagesByType(userId, type, pageRequest);
        } else {
            messagePage = messageRepository.findUserMessages(userId, pageRequest);
        }

        // 批量查询已读状态
        Set<Long> messageIds = messagePage.getContent().stream()
                .map(Message::getId)
                .collect(Collectors.toSet());

        Set<Long> readMessageIds = findReadMessageIds(userId, messageIds);

        // 排除已 dismiss 的消息
        Set<Long> dismissedIds = messageDismissalRepository.findByUserIdAndMessageIdIn(userId, messageIds)
                .stream().map(MessageDismissal::getMessageId).collect(Collectors.toSet());

        List<MessageResponse> items = messagePage.getContent().stream()
                .filter(msg -> !msg.getDeleted()) // 排除已删除
                .filter(msg -> !dismissedIds.contains(msg.getId()))
                .map(msg -> toMessageResponse(msg, readMessageIds.contains(msg.getId())))
                .toList();

        // 按已读状态筛选
        Stream<MessageResponse> stream = items.stream();
        if ("unread".equalsIgnoreCase(readStatus)) {
            stream = stream.filter(msg -> !msg.isRead());
        } else if ("read".equalsIgnoreCase(readStatus)) {
            stream = stream.filter(msg -> msg.isRead());
        }
        items = stream.toList();

        PagedResponse<MessageResponse> response = new PagedResponse<>();
        response.setItems(items);
        response.setTotal(messagePage.getTotalElements());
        response.setPage(page);
        response.setPageSize(safePageSize);
        return response;
    }

    // ==================== 消息详情 ====================

    /**
     * 获取消息详情
     */
    @Transactional(readOnly = true)
    public MessageDetailResponse getMessageDetail(Long userId, Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MSG_NOT_FOUND, "消息不存在", 404));

        // 校验用户是否有权查看该消息
        if (!hasAccess(userId, messageId)) {
            throw new BusinessException(ErrorCode.MSG_NO_ACCESS, "无权查看该消息", 403);
        }

        boolean read = messageReadRepository.existsByMessageIdAndUserId(messageId, userId);
        MessageRead messageRead = read
                ? messageReadRepository.findByUserIdAndMessageIdIn(userId, Set.of(messageId))
                    .stream().findFirst().orElse(null)
                : null;

        return MessageDetailResponse.builder()
                .id(message.getId())
                .title(message.getTitle())
                .content(message.getContent())
                .type(message.getType())
                .priority(message.getPriority())
                .senderId(message.getSenderId())
                .toolId(message.getToolId())
                .toolOperationId(message.getToolOperationId())
                .read(read)
                .readAt(messageRead != null ? messageRead.getReadAt() : null)
                .createdAt(message.getCreatedAt())
                .build();
    }

    // ==================== 未读计数 ====================

    /**
     * 获取用户未读消息计数
     */
    @Transactional(readOnly = true)
    public UnreadCountResponse getUnreadCount(Long userId) {
        List<Long> userMessageIds = messageRepository.findUserMessageIds(userId);

        if (userMessageIds.isEmpty()) {
            return UnreadCountResponse.builder()
                    .total(0)
                    .byType(Map.of())
                    .build();
        }

        Set<Long> messageIdSet = new HashSet<>(userMessageIds);
        long readCount = messageReadRepository.countByUserIdAndMessageIdIn(userId, messageIdSet);
        long totalUnread = userMessageIds.size() - readCount;

        // 按类型统计未读
        Map<String, Long> byType = new LinkedHashMap<>();
        List<Message> messages = messageRepository.findAllById(userMessageIds);
        Set<Long> readIds = findReadMessageIds(userId, messageIdSet);

        Map<String, Long> typeUnreadMap = messages.stream()
                .filter(m -> !readIds.contains(m.getId()))
                .collect(Collectors.groupingBy(Message::getType, Collectors.counting()));

        byType.putAll(typeUnreadMap);

        return UnreadCountResponse.builder()
                .total(totalUnread)
                .byType(byType)
                .build();
    }

    // ==================== 标记已读 ====================

    /**
     * 标记单条消息已读
     */
    @Transactional
    public void markAsRead(Long userId, Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MSG_NOT_FOUND, "消息不存在", 404));

        if (!hasAccess(userId, messageId)) {
            throw new BusinessException(ErrorCode.MSG_NO_ACCESS, "无权操作该消息", 403);
        }

        if (messageReadRepository.existsByMessageIdAndUserId(messageId, userId)) {
            throw new BusinessException(ErrorCode.MSG_ALREADY_READ, "消息已读", 409);
        }

        MessageRead messageRead = MessageRead.builder()
                .messageId(messageId)
                .userId(userId)
                .build();
        messageReadRepository.save(messageRead);

        log.info("用户 {} 标记消息 {} 为已读", userId, messageId);
    }

    /**
     * 标记所有消息已读
     */
    @Transactional
    public long markAllAsRead(Long userId) {
        List<Long> userMessageIds = messageRepository.findUserMessageIds(userId);

        if (userMessageIds.isEmpty()) {
            return 0;
        }

        Set<Long> messageIdSet = new HashSet<>(userMessageIds);
        Set<Long> readIds = findReadMessageIds(userId, messageIdSet);

        long count = 0;
        for (Long msgId : userMessageIds) {
            if (!readIds.contains(msgId)) {
                MessageRead messageRead = MessageRead.builder()
                        .messageId(msgId)
                        .userId(userId)
                        .build();
                messageReadRepository.save(messageRead);
                count++;
            }
        }

        log.info("用户 {} 标记所有消息已读，共 {} 条", userId, count);
        return count;
    }

    // ==================== 消息隐藏（dismiss） ====================

    /**
     * 隐藏消息（仅对当前用户不可见）
     */
    @Transactional
    public void dismissMessage(Long userId, Long messageId) {
        if (!messageRepository.existsById(messageId)) {
            throw new BusinessException(ErrorCode.MSG_NOT_FOUND, "消息不存在", 404);
        }
        if (!hasAccess(userId, messageId)) {
            throw new BusinessException(ErrorCode.MSG_NO_ACCESS, "无权操作该消息", 403);
        }
        if (!messageDismissalRepository.existsByUserIdAndMessageId(userId, messageId)) {
            messageDismissalRepository.save(MessageDismissal.builder()
                    .messageId(messageId)
                    .userId(userId)
                    .dismissedAt(LocalDateTime.now())
                    .build());
        }
    }

    /**
     * 批量隐藏消息
     */
    @Transactional
    public void dismissMessages(Long userId, List<Long> messageIds) {
        for (Long messageId : messageIds) {
            dismissMessage(userId, messageId);
        }
    }

    // ==================== 公告管理（管理员） ====================

    /**
     * 查询公告列表（管理员视角，含已删除）
     */
    @Transactional(readOnly = true)
    public PagedResponse<MessageResponse> listAnnouncements(int page, int pageSize) {
        int safePage = Math.max(page, 1) - 1;
        int safePageSize = Math.min(Math.max(pageSize, 1), 100);

        PageRequest pageRequest = PageRequest.of(safePage, safePageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Message> messagePage = messageRepository.findByType(Message.TYPE_ANNOUNCEMENT, pageRequest);

        List<MessageResponse> items = messagePage.getContent().stream()
                .map(this::toAnnouncementResponse)
                .toList();

        PagedResponse<MessageResponse> response = new PagedResponse<>();
        response.setItems(items);
        response.setTotal(messagePage.getTotalElements());
        response.setPage(page);
        response.setPageSize(safePageSize);
        return response;
    }

    /**
     * 编辑公告
     */
    @Transactional
    public Message updateAnnouncement(Long messageId, String title, String content) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MSG_NOT_FOUND, "消息不存在", 404));
        if (!Message.TYPE_ANNOUNCEMENT.equals(message.getType())) {
            throw new BusinessException(ErrorCode.MSG_NO_ACCESS, "仅可编辑公告类型消息", 400);
        }
        if (message.getDeleted()) {
            throw new BusinessException(ErrorCode.MSG_NOT_FOUND, "消息已删除", 404);
        }
        message.setTitle(title);
        message.setContent(content);
        message.setEditedAt(LocalDateTime.now());
        return messageRepository.save(message);
    }

    /**
     * 删除公告（软删除）
     */
    @Transactional
    public void deleteAnnouncement(Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MSG_NOT_FOUND, "消息不存在", 404));
        if (!Message.TYPE_ANNOUNCEMENT.equals(message.getType())) {
            throw new BusinessException(ErrorCode.MSG_NO_ACCESS, "仅可删除公告类型消息", 400);
        }
        message.setDeleted(true);
        messageRepository.save(message);
    }

    /**
     * 查询公告的定向接收人列表
     */
    @Transactional(readOnly = true)
    public List<AdminMessageController.RecipientInfo> listAnnouncementRecipients(Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MSG_NOT_FOUND, "消息不存在", 404));

        List<MessageRecipient> recipients = messageRecipientRepository.findByMessageId(messageId);
        boolean isBroadcast = recipients.stream().anyMatch(r -> r.getUserId() == null);
        if (isBroadcast) {
            return List.of(); // 全员广播无需返回接收人
        }

        List<Long> userIds = recipients.stream()
                .map(MessageRecipient::getUserId)
                .filter(Objects::nonNull)
                .toList();

        if (userIds.isEmpty()) {
            return List.of();
        }

        List<User> users = userRepository.findAllById(userIds);
        return users.stream()
                .map(u -> AdminMessageController.RecipientInfo.builder()
                        .userId(u.getId())
                        .username(u.getUsername())
                        .email(u.getEmail())
                        .build())
                .toList();
    }

    // ==================== 私有方法 ====================

    private boolean hasAccess(Long userId, Long messageId) {
        // 定向消息
        if (messageRecipientRepository.existsByMessageIdAndUserId(messageId, userId)) {
            return true;
        }
        // 全员广播
        return !messageRecipientRepository.findByMessageIdAndUserIdIsNull(messageId).isEmpty();
    }

    private Set<Long> findReadMessageIds(Long userId, Set<Long> messageIds) {
        if (messageIds == null || messageIds.isEmpty()) {
            return Set.of();
        }
        return messageReadRepository.findByUserIdAndMessageIdIn(userId, messageIds)
                .stream()
                .map(MessageRead::getMessageId)
                .collect(Collectors.toSet());
    }

    private MessageResponse toMessageResponse(Message msg, boolean read) {
        String summary = msg.getContent() != null && msg.getContent().length() > 50
                ? msg.getContent().substring(0, 50) + "…"
                : msg.getContent();
        return MessageResponse.builder()
                .id(msg.getId())
                .title(msg.getTitle())
                .summary(summary)
                .type(msg.getType())
                .priority(msg.getPriority())
                .senderId(msg.getSenderId())
                .read(read)
                .createdAt(msg.getCreatedAt())
                .build();
    }

    private MessageResponse toAnnouncementResponse(Message msg) {
        String summary = msg.getContent() != null && msg.getContent().length() > 50
                ? msg.getContent().substring(0, 50) + "…"
                : msg.getContent();

        // 查询接收人信息
        List<MessageRecipient> recipients = messageRecipientRepository.findByMessageId(msg.getId());
        boolean isBroadcast = recipients.stream().anyMatch(r -> r.getUserId() == null);
        long recipientCount = isBroadcast ? -1 : recipients.size(); // -1 表示全员广播

        return MessageResponse.builder()
                .id(msg.getId())
                .title(msg.getTitle())
                .summary(summary)
                .type(msg.getType())
                .priority(msg.getPriority())
                .senderId(msg.getSenderId())
                .read(false)
                .createdAt(msg.getCreatedAt())
                .deleted(msg.getDeleted())
                .editedAt(msg.getEditedAt())
                .recipientCount((int) recipientCount)
                .scope(isBroadcast ? "BROADCAST" : "TARGETED")
                .build();
    }
}
