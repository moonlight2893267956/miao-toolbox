package com.miao.toolbox.notification.service;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.notification.dto.MessageDetailResponse;
import com.miao.toolbox.notification.dto.MessageResponse;
import com.miao.toolbox.notification.dto.SendMessageRequest;
import com.miao.toolbox.notification.entity.Message;
import com.miao.toolbox.notification.entity.MessageRecipient;
import com.miao.toolbox.notification.repository.MessageDismissalRepository;
import com.miao.toolbox.notification.repository.MessageReadRepository;
import com.miao.toolbox.notification.repository.MessageRecipientRepository;
import com.miao.toolbox.notification.repository.MessageRepository;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.storage.service.StorageService;
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
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("NotificationService 图片消息单元测试")
class NotificationServiceImageTest {

    @Mock private MessageRepository messageRepository;
    @Mock private MessageRecipientRepository messageRecipientRepository;
    @Mock private MessageReadRepository messageReadRepository;
    @Mock private MessageDismissalRepository messageDismissalRepository;
    @Mock private UserRepository userRepository;
    @Mock private StorageService storageService;

    @InjectMocks
    private NotificationService notificationService;

    private static final String IMAGE_COS_KEY = "messages/abc12345-banner.png";

    private Message imageMessage;

    @BeforeEach
    void setUp() {
        imageMessage = Message.builder()
                .id(10L)
                .title("系统维护公告")
                .content("服务器将于今晚进行维护")
                .type("ANNOUNCEMENT")
                .priority("NORMAL")
                .senderId(100L)
                .imageCosKey(IMAGE_COS_KEY)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    // ===== sendMessage 携带图片 =====

    @Nested
    @DisplayName("发送图片消息")
    class SendImageMessageTests {

        @Test
        @DisplayName("发送消息携带 imageCosKey - 保存成功")
        void sendMessage_withImage_success() {
            SendMessageRequest request = SendMessageRequest.builder()
                    .title("公告")
                    .content("内容")
                    .type("ANNOUNCEMENT")
                    .scope("BROADCAST")
                    .imageCosKey(IMAGE_COS_KEY)
                    .build();

            when(messageRepository.save(any(Message.class))).thenAnswer(inv -> {
                Message m = inv.getArgument(0);
                m.setId(10L);
                return m;
            });
            when(messageRecipientRepository.save(any(MessageRecipient.class))).thenReturn(null);

            Message result = notificationService.sendMessage(request, 100L);

            assertNotNull(result);
            assertEquals(IMAGE_COS_KEY, result.getImageCosKey());
            verify(messageRepository).save(argThat(m -> IMAGE_COS_KEY.equals(m.getImageCosKey())));
        }

        @Test
        @DisplayName("发送无图消息 - imageCosKey 为 null")
        void sendMessage_withoutImage() {
            SendMessageRequest request = SendMessageRequest.builder()
                    .title("公告")
                    .content("内容")
                    .scope("BROADCAST")
                    .build();

            when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));
            when(messageRecipientRepository.save(any(MessageRecipient.class))).thenReturn(null);

            Message result = notificationService.sendMessage(request, 100L);

            assertNull(result.getImageCosKey());
        }
    }

    // ===== 消息详情包含 imageUrl =====

    @Nested
    @DisplayName("消息详情图片字段")
    class GetMessageDetailImageTests {

        @Test
        @DisplayName("带图消息详情 - 返回 imageUrl")
        void getMessageDetail_withImage_hasImageUrl() {
            when(messageRepository.findById(10L)).thenReturn(Optional.of(imageMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(10L, 1L)).thenReturn(true);
            when(messageReadRepository.existsByMessageIdAndUserId(10L, 1L)).thenReturn(false);

            MessageDetailResponse result = notificationService.getMessageDetail(1L, 10L);

            assertNotNull(result.getImageUrl());
            assertEquals("/api/messages/10/image", result.getImageUrl());
        }

        @Test
        @DisplayName("无图消息详情 - imageUrl 为 null（向后兼容）")
        void getMessageDetail_withoutImage_imageUrlNull() {
            Message plainMessage = Message.builder()
                    .id(11L)
                    .title("无图公告")
                    .content("纯文本内容")
                    .type("ANNOUNCEMENT")
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();
            when(messageRepository.findById(11L)).thenReturn(Optional.of(plainMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(11L, 1L)).thenReturn(true);
            when(messageReadRepository.existsByMessageIdAndUserId(11L, 1L)).thenReturn(false);

            MessageDetailResponse result = notificationService.getMessageDetail(1L, 11L);

            assertNull(result.getImageUrl());
        }
    }

    // ===== 消息列表包含 hasImage =====

    @Nested
    @DisplayName("消息列表图片标识")
    class ListMessagesImageTests {

        @Test
        @DisplayName("列表含带图消息 - hasImage 为 true")
        void listMessages_withImage_hasImageTrue() {
            Page<Message> page = new PageImpl<>(List.of(imageMessage));
            when(messageRepository.findUserMessages(eq(1L), any(Pageable.class))).thenReturn(page);
            when(messageReadRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(Collections.emptyList());
            when(messageDismissalRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(Collections.emptyList());

            PagedResponse<MessageResponse> result = notificationService.listMessages(1L, 1, 20, null, null);

            assertEquals(1, result.getItems().size());
            assertTrue(result.getItems().get(0).isHasImage());
        }

        @Test
        @DisplayName("列表含无图消息 - hasImage 为 false（向后兼容）")
        void listMessages_withoutImage_hasImageFalse() {
            Message plainMessage = Message.builder()
                    .id(11L)
                    .title("无图公告")
                    .content("纯文本内容")
                    .type("SYSTEM")
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();
            Page<Message> page = new PageImpl<>(List.of(plainMessage));
            when(messageRepository.findUserMessages(eq(1L), any(Pageable.class))).thenReturn(page);
            when(messageReadRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(Collections.emptyList());
            when(messageDismissalRepository.findByUserIdAndMessageIdIn(eq(1L), any(Set.class)))
                    .thenReturn(Collections.emptyList());

            PagedResponse<MessageResponse> result = notificationService.listMessages(1L, 1, 20, null, null);

            assertFalse(result.getItems().get(0).isHasImage());
        }
    }

    // ===== 公告列表 hasImage =====

    @Nested
    @DisplayName("公告列表图片标识")
    class ListAnnouncementsImageTests {

        @Test
        @DisplayName("公告列表含带图公告 - hasImage 为 true")
        void listAnnouncements_withImage() {
            Page<Message> page = new PageImpl<>(List.of(imageMessage));
            when(messageRepository.findByType(eq("ANNOUNCEMENT"), any(Pageable.class))).thenReturn(page);
            when(messageRecipientRepository.findByMessageId(10L)).thenReturn(
                    List.of(MessageRecipient.builder().messageId(10L).userId(null).build()));

            PagedResponse<MessageResponse> result = notificationService.listAnnouncements(1, 20);

            assertTrue(result.getItems().get(0).isHasImage());
        }
    }

    // ===== getMessageImageCosKey =====

    @Nested
    @DisplayName("获取消息配图 COS key")
    class GetMessageImageCosKeyTests {

        @Test
        @DisplayName("有权查看且带图 - 返回 COS key")
        void getMessageImageCosKey_success() {
            when(messageRepository.findById(10L)).thenReturn(Optional.of(imageMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(10L, 1L)).thenReturn(true);

            String cosKey = notificationService.getMessageImageCosKey(1L, 10L);

            assertEquals(IMAGE_COS_KEY, cosKey);
        }

        @Test
        @DisplayName("无权查看 - 抛出异常")
        void getMessageImageCosKey_noAccess() {
            when(messageRepository.findById(10L)).thenReturn(Optional.of(imageMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(10L, 999L)).thenReturn(false);
            when(messageRecipientRepository.findByMessageIdAndUserIdIsNull(10L))
                    .thenReturn(Collections.emptyList());

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> notificationService.getMessageImageCosKey(999L, 10L));

            assertEquals("MSG_NO_ACCESS", ex.getErrorCode());
        }

        @Test
        @DisplayName("消息不存在 - 抛出异常")
        void getMessageImageCosKey_notFound() {
            when(messageRepository.findById(99L)).thenReturn(Optional.empty());

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> notificationService.getMessageImageCosKey(1L, 99L));

            assertEquals("MSG_NOT_FOUND", ex.getErrorCode());
        }

        @Test
        @DisplayName("无配图消息 - 返回 null")
        void getMessageImageCosKey_noImage() {
            Message plainMessage = Message.builder()
                    .id(11L)
                    .title("无图公告")
                    .content("纯文本内容")
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();
            when(messageRepository.findById(11L)).thenReturn(Optional.of(plainMessage));
            when(messageRecipientRepository.existsByMessageIdAndUserId(11L, 1L)).thenReturn(true);

            String cosKey = notificationService.getMessageImageCosKey(1L, 11L);

            assertNull(cosKey);
        }
    }

    // ===== updateAnnouncement 更新图片 =====

    @Nested
    @DisplayName("编辑公告图片")
    class UpdateAnnouncementImageTests {

        @Test
        @DisplayName("更新公告并替换图片 - 更新 imageCosKey 并清理旧图")
        void updateAnnouncement_replaceImage() {
            when(messageRepository.findById(10L)).thenReturn(Optional.of(imageMessage));
            when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));

            String newKey = "messages/xyz98765-new.png";
            Message result = notificationService.updateAnnouncement(
                    10L, "新标题", "新内容", newKey);

            assertEquals(newKey, result.getImageCosKey());
            assertNotNull(result.getEditedAt());
            // 无事务环境下直接同步删除旧 COS 对象
            verify(storageService).deleteObject(IMAGE_COS_KEY);
        }

        @Test
        @DisplayName("更新公告移除图片 - imageCosKey 置空并清理旧图")
        void updateAnnouncement_removeImage() {
            when(messageRepository.findById(10L)).thenReturn(Optional.of(imageMessage));
            when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));

            Message result = notificationService.updateAnnouncement(
                    10L, "新标题", "新内容", null);

            assertNull(result.getImageCosKey());
            verify(storageService).deleteObject(IMAGE_COS_KEY);
        }

        @Test
        @DisplayName("更新公告不修改图片 - 不清理旧图")
        void updateAnnouncement_keepImage() {
            when(messageRepository.findById(10L)).thenReturn(Optional.of(imageMessage));
            when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));

            notificationService.updateAnnouncement(
                    10L, "新标题", "新内容", IMAGE_COS_KEY);

            verify(storageService, never()).deleteObject(anyString());
        }

        @Test
        @DisplayName("编辑非公告消息 - 抛出异常")
        void updateAnnouncement_notAnnouncement() {
            Message toolMessage = Message.builder()
                    .id(20L)
                    .title("工具通知")
                    .content("工具执行结果")
                    .type("TOOL")
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();
            when(messageRepository.findById(20L)).thenReturn(Optional.of(toolMessage));

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> notificationService.updateAnnouncement(20L, "t", "c", null));

            assertEquals("MSG_NO_ACCESS", ex.getErrorCode());
        }
    }
}
