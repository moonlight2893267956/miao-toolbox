package com.miao.toolbox.notification.service;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.notification.dto.MessageDetailResponse;
import com.miao.toolbox.notification.dto.MessageResponse;
import com.miao.toolbox.notification.dto.SendMessageRequest;
import com.miao.toolbox.notification.dto.UnreadCountResponse;
import com.miao.toolbox.notification.entity.Message;
import com.miao.toolbox.notification.entity.MessageRead;
import com.miao.toolbox.notification.entity.MessageRecipient;
import com.miao.toolbox.notification.repository.MessageDismissalRepository;
import com.miao.toolbox.notification.repository.MessageReadRepository;
import com.miao.toolbox.notification.repository.MessageRecipientRepository;
import com.miao.toolbox.notification.repository.MessageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("NotificationService 单元测试")
class NotificationServiceTest {

    @Mock private MessageRepository messageRepository;
    @Mock private MessageRecipientRepository messageRecipientRepository;
    @Mock private MessageReadRepository messageReadRepository;
    @Mock private MessageDismissalRepository messageDismissalRepository;

    @InjectMocks
    private NotificationService notificationService;

    private Message testMessage;

    @BeforeEach
    void setUp() {
        // 默认 mock：无已隐藏消息（lenient 因为不是所有测试都用）
        lenient().when(messageDismissalRepository.findByUserIdAndMessageIdIn(anyLong(), any(Set.class)))
                .thenReturn(Collections.emptyList());

        testMessage = Message.builder()
                .id(1L)
                .title("系统通知")
                .content("这是一条测试消息")
                .type("SYSTEM")
                .priority("NORMAL")
                .senderId(100L)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    // ===== sendMessage =====

    @Nested
    @DisplayName("发送消息")
    class SendMessageTests {

        @Test
        @DisplayName("定向发送消息 - 成功")
        void sendMessage_targeted_success() {
            SendMessageRequest request = SendMessageRequest.builder()
                    .title("测试标题")
                    .content("测试内容")
                    .type("SYSTEM")
                    .priority("NORMAL")
                    .scope("TARGETED")
                    .userIds(List.of(1L, 2L))
                    .build();

            when(messageRepository.save(any(Message.class))).thenReturn(testMessage);
            when(messageRecipientRepository.save(any(MessageRecipient.class))).thenReturn(null);

            Message result = notificationService.sendMessage(request, 100L);

            assertNotNull(result);
            assertEquals("系统通知", result.getTitle());
            verify(messageRecipientRepository, times(2)).save(any(MessageRecipient.class));
        }

        @Test
        @DisplayName("全员广播消息 - 成功")
        void sendMessage_broadcast_success() {
            SendMessageRequest request = SendMessageRequest.builder()
                    .title("广播标题")
                    .content("广播内容")
                    .userIds(null)
                    .build();

            when(messageRepository.save(any(Message.class))).thenReturn(testMessage);
            when(messageRecipientRepository.save(any(MessageRecipient.class))).thenReturn(null);

            Message result = notificationService.sendMessage(request, 100L);

            assertNotNull(result);
            verify(messageRecipientRepository, times(1)).save(argThat(r -> r.getUserId() == null));
        }

        @Test
        @DisplayName("空 userIds 列表视为全员广播")
        void sendMessage_emptyUserIds_broadcast() {
            SendMessageRequest request = SendMessageRequest.builder()
                    .title("广播标题")
                    .content("广播内容")
                    .userIds(Collections.emptyList())
                    .build();

            when(messageRepository.save(any(Message.class))).thenReturn(testMessage);
            when(messageRecipientRepository.save(any(MessageRecipient.class))).thenReturn(null);

            Message result = notificationService.sendMessage(request, 100L);

            assertNotNull(result);
            verify(messageRecipientRepository, times(1)).save(argThat(r -> r.getUserId() == null));
        }
    }

    // ===== listMessages =====

    @Nested
    @DisplayName("查询消息列表")
    class ListMessagesTests {

        @Test
        @DisplayName("分页查询消息列表 - 成功")
        void listMessages_success() {
            Page<Message> page = new PageImpl<>(List.of(testMessage));
            when(messageRepository.findUserMessages(eq(1L), any(Pageable.class))).thenReturn(page);
            when(messageReadRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(Collections.emptyList());

            PagedResponse<MessageResponse> result = notificationService.listMessages(1L, 1, 20, null, null);

            assertEquals(1, result.getItems().size());
            assertEquals("系统通知", result.getItems().get(0).getTitle());
            assertFalse(result.getItems().get(0).isRead());
        }

        @Test
        @DisplayName("按类型过滤消息列表")
        void listMessages_byType() {
            Page<Message> page = new PageImpl<>(List.of(testMessage));
            when(messageRepository.findUserMessagesByType(eq(1L), eq("SYSTEM"), any(Pageable.class))).thenReturn(page);
            when(messageReadRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(Collections.emptyList());

            PagedResponse<MessageResponse> result = notificationService.listMessages(1L, 1, 20, "SYSTEM", null);

            assertEquals(1, result.getItems().size());
        }

        @Test
        @DisplayName("已读消息标记为已读")
        void listMessages_readStatus() {
            Page<Message> page = new PageImpl<>(List.of(testMessage));
            when(messageRepository.findUserMessages(eq(1L), any(Pageable.class))).thenReturn(page);

            MessageRead readRecord = MessageRead.builder().messageId(1L).userId(1L).readAt(LocalDateTime.now()).build();
            when(messageReadRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(List.of(readRecord));

            PagedResponse<MessageResponse> result = notificationService.listMessages(1L, 1, 20, null, null);

            assertTrue(result.getItems().get(0).isRead());
        }

        @Test
        @DisplayName("分页参数边界处理")
        void listMessages_pageBoundary() {
            Page<Message> page = new PageImpl<>(List.of());
            when(messageRepository.findUserMessages(eq(1L), any(Pageable.class))).thenReturn(page);

            PagedResponse<MessageResponse> result = notificationService.listMessages(1L, 0, 500, null, null);

            assertEquals(100, result.getPageSize()); // clamped to 100
        }
    }

    // ===== getMessageDetail =====

    @Nested
    @DisplayName("获取消息详情")
    class GetMessageDetailTests {

        @Test
        @DisplayName("获取消息详情 - 成功")
        void getMessageDetail_success() {
            when(messageRepository.findById(1L)).thenReturn(Optional.of(testMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(1L, 1L)).thenReturn(true);
            when(messageReadRepository.existsByMessageIdAndUserId(1L, 1L)).thenReturn(false);

            MessageDetailResponse result = notificationService.getMessageDetail(1L, 1L);

            assertEquals("系统通知", result.getTitle());
            assertEquals("这是一条测试消息", result.getContent());
            assertFalse(result.isRead());
        }

        @Test
        @DisplayName("消息不存在 - 抛出异常")
        void getMessageDetail_notFound() {
            when(messageRepository.findById(99L)).thenReturn(Optional.empty());

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> notificationService.getMessageDetail(1L, 99L));
            assertEquals("MSG_NOT_FOUND", ex.getErrorCode());
        }

        @Test
        @DisplayName("无权查看消息 - 抛出异常")
        void getMessageDetail_noAccess() {
            when(messageRepository.findById(1L)).thenReturn(Optional.of(testMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(1L, 999L)).thenReturn(false);
            when(messageRecipientRepository.findByMessageIdAndUserIdIsNull(1L)).thenReturn(Collections.emptyList());

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> notificationService.getMessageDetail(999L, 1L));
            assertEquals("MSG_NO_ACCESS", ex.getErrorCode());
        }

        @Test
        @DisplayName("全员广播消息 - 有权查看")
        void getMessageDetail_broadcastAccess() {
            when(messageRepository.findById(1L)).thenReturn(Optional.of(testMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(1L, 1L)).thenReturn(false);
            when(messageRecipientRepository.findByMessageIdAndUserIdIsNull(1L))
                    .thenReturn(List.of(MessageRecipient.builder().messageId(1L).userId(null).build()));
            when(messageReadRepository.existsByMessageIdAndUserId(1L, 1L)).thenReturn(true);
            when(messageReadRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(List.of(MessageRead.builder().messageId(1L).userId(1L).readAt(LocalDateTime.now()).build()));

            MessageDetailResponse result = notificationService.getMessageDetail(1L, 1L);

            assertTrue(result.isRead());
            assertNotNull(result.getReadAt());
        }
    }

    // ===== getUnreadCount =====

    @Nested
    @DisplayName("未读消息计数")
    class UnreadCountTests {

        @Test
        @DisplayName("无消息时返回0")
        void getUnreadCount_noMessages() {
            when(messageRepository.findUserMessageIds(1L)).thenReturn(Collections.emptyList());

            UnreadCountResponse result = notificationService.getUnreadCount(1L);

            assertEquals(0, result.getTotal());
            assertTrue(result.getByType().isEmpty());
        }

        @Test
        @DisplayName("正确计算未读数")
        void getUnreadCount_withUnread() {
            when(messageRepository.findUserMessageIds(1L)).thenReturn(List.of(1L, 2L));
            when(messageReadRepository.countByUserIdAndMessageIdIn(eq(1L), any(Set.class))).thenReturn(1L);
            when(messageRepository.findAllById(List.of(1L, 2L))).thenReturn(List.of(testMessage,
                    Message.builder().id(2L).title("工具通知").type("TOOL").build()));
            when(messageReadRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(List.of(MessageRead.builder().messageId(1L).userId(1L).build()));

            UnreadCountResponse result = notificationService.getUnreadCount(1L);

            assertEquals(1, result.getTotal());
            assertEquals(1L, result.getByType().get("TOOL"));
        }
    }

    // ===== markAsRead =====

    @Nested
    @DisplayName("标记已读")
    class MarkAsReadTests {

        @Test
        @DisplayName("标记单条消息已读 - 成功")
        void markAsRead_success() {
            when(messageRepository.findById(1L)).thenReturn(Optional.of(testMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(1L, 1L)).thenReturn(true);
            when(messageReadRepository.existsByMessageIdAndUserId(1L, 1L)).thenReturn(false);
            when(messageReadRepository.save(any(MessageRead.class))).thenReturn(null);

            notificationService.markAsRead(1L, 1L);

            verify(messageReadRepository).save(any(MessageRead.class));
        }

        @Test
        @DisplayName("消息不存在 - 抛出异常")
        void markAsRead_notFound() {
            when(messageRepository.findById(99L)).thenReturn(Optional.empty());

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> notificationService.markAsRead(1L, 99L));
            assertEquals("MSG_NOT_FOUND", ex.getErrorCode());
        }

        @Test
        @DisplayName("无权操作 - 抛出异常")
        void markAsRead_noAccess() {
            when(messageRepository.findById(1L)).thenReturn(Optional.of(testMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(1L, 999L)).thenReturn(false);
            when(messageRecipientRepository.findByMessageIdAndUserIdIsNull(1L)).thenReturn(Collections.emptyList());

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> notificationService.markAsRead(999L, 1L));
            assertEquals("MSG_NO_ACCESS", ex.getErrorCode());
        }

        @Test
        @DisplayName("重复标记已读 - 抛出异常")
        void markAsRead_alreadyRead() {
            when(messageRepository.findById(1L)).thenReturn(Optional.of(testMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(1L, 1L)).thenReturn(true);
            when(messageReadRepository.existsByMessageIdAndUserId(1L, 1L)).thenReturn(true);

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> notificationService.markAsRead(1L, 1L));
            assertEquals("MSG_ALREADY_READ", ex.getErrorCode());
        }
    }

    // ===== markAllAsRead =====

    @Nested
    @DisplayName("标记所有已读")
    class MarkAllAsReadTests {

        @Test
        @DisplayName("无消息时返回0")
        void markAllAsRead_noMessages() {
            when(messageRepository.findUserMessageIds(1L)).thenReturn(Collections.emptyList());

            long count = notificationService.markAllAsRead(1L);

            assertEquals(0, count);
        }

        @Test
        @DisplayName("标记所有未读消息为已读")
        void markAllAsRead_success() {
            when(messageRepository.findUserMessageIds(1L)).thenReturn(List.of(1L, 2L));
            when(messageReadRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(List.of(MessageRead.builder().messageId(1L).userId(1L).build()));
            when(messageReadRepository.save(any(MessageRead.class))).thenReturn(null);

            long count = notificationService.markAllAsRead(1L);

            assertEquals(1, count); // 只有消息2未读
            verify(messageReadRepository, times(1)).save(any(MessageRead.class));
        }

        @Test
        @DisplayName("所有消息都已读时返回0")
        void markAllAsRead_allRead() {
            when(messageRepository.findUserMessageIds(1L)).thenReturn(List.of(1L));
            when(messageReadRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(List.of(MessageRead.builder().messageId(1L).userId(1L).build()));

            long count = notificationService.markAllAsRead(1L);

            assertEquals(0, count);
            verify(messageReadRepository, never()).save(any(MessageRead.class));
        }
    }
}
