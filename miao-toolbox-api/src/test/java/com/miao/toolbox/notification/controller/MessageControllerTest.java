package com.miao.toolbox.notification.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.notification.dto.MessageDetailResponse;
import com.miao.toolbox.notification.dto.MessageResponse;
import com.miao.toolbox.notification.dto.SendMessageRequest;
import com.miao.toolbox.notification.dto.UnreadCountResponse;
import com.miao.toolbox.notification.entity.Message;
import com.miao.toolbox.notification.service.NotificationService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("MessageController 单元测试")
class MessageControllerTest {

    private MockMvc mockMvc;

    @Mock private NotificationService notificationService;

    @InjectMocks private MessageController messageController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final User TEST_USER = User.builder()
            .id(1L).username("testuser")
            .isEnabled(true).build();

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.standaloneSetup(messageController)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(TEST_USER, null, List.of(() -> "ROLE_USER"))
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("GET /api/messages/unread-count 返回未读计数")
    void getUnreadCount_returnsOk() throws Exception {
        UnreadCountResponse response = UnreadCountResponse.builder()
                .total(5L)
                .byType(Map.of("SYSTEM", 3L, "TOOL", 2L))
                .build();
        when(notificationService.getUnreadCount(1L)).thenReturn(response);

        mockMvc.perform(get("/api/messages/unread-count"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.total").value(5))
                .andExpect(jsonPath("$.data.byType.SYSTEM").value(3))
                .andExpect(jsonPath("$.data.byType.TOOL").value(2));
    }

    @Test
    @DisplayName("GET /api/messages 返回消息列表")
    void listMessages_returnsOk() throws Exception {
        MessageResponse msg = MessageResponse.builder()
                .id(1L).title("测试消息").type("SYSTEM").priority("NORMAL")
                .read(false).createdAt(LocalDateTime.now()).build();

        PagedResponse<MessageResponse> page = new PagedResponse<>();
        page.setItems(List.of(msg));
        page.setTotal(1L);
        page.setPage(1);
        page.setPageSize(20);

        when(notificationService.listMessages(eq(1L), eq(1), eq(20), isNull(), isNull())).thenReturn(page);

        mockMvc.perform(get("/api/messages")
                        .param("page", "1")
                        .param("pageSize", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.items[0].title").value("测试消息"));
    }

    @Test
    @DisplayName("GET /api/messages?type=SYSTEM 按类型过滤")
    void listMessages_byType() throws Exception {
        PagedResponse<MessageResponse> page = new PagedResponse<>();
        page.setItems(List.of());
        page.setTotal(0L);
        page.setPage(1);
        page.setPageSize(20);

        when(notificationService.listMessages(eq(1L), eq(1), eq(20), eq("SYSTEM"), isNull())).thenReturn(page);

        mockMvc.perform(get("/api/messages")
                        .param("type", "SYSTEM"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));
    }

    @Test
    @DisplayName("GET /api/messages/{id} 返回消息详情")
    void getMessageDetail_returnsOk() throws Exception {
        MessageDetailResponse detail = MessageDetailResponse.builder()
                .id(1L).title("测试消息").content("详细内容")
                .type("SYSTEM").priority("NORMAL").read(false)
                .createdAt(LocalDateTime.now()).build();

        when(notificationService.getMessageDetail(1L, 1L)).thenReturn(detail);

        mockMvc.perform(get("/api/messages/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.title").value("测试消息"))
                .andExpect(jsonPath("$.data.content").value("详细内容"));
    }

    @Test
    @DisplayName("PUT /api/messages/{id}/read 标记已读")
    void markAsRead_returnsOk() throws Exception {
        mockMvc.perform(put("/api/messages/1/read"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        verify(notificationService).markAsRead(1L, 1L);
    }

    @Test
    @DisplayName("PUT /api/messages/read-all 标记所有已读")
    void markAllAsRead_returnsOk() throws Exception {
        when(notificationService.markAllAsRead(1L)).thenReturn(3L);

        mockMvc.perform(put("/api/messages/read-all"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.count").value(3));
    }
}

@ExtendWith(MockitoExtension.class)
@DisplayName("AdminMessageController 单元测试")
class AdminMessageControllerTest {

    private MockMvc mockMvc;

    @Mock private NotificationService notificationService;

    @InjectMocks private AdminMessageController adminMessageController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final User ADMIN_USER = User.builder()
            .id(1L).username("admin")
            .isEnabled(true).build();

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.standaloneSetup(adminMessageController)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(ADMIN_USER, null, List.of(() -> "ROLE_SUPER_ADMIN"))
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("POST /api/admin/messages 发送定向消息")
    void sendMessage_targeted() throws Exception {
        SendMessageRequest request = SendMessageRequest.builder()
                .title("测试标题")
                .content("测试内容")
                .type("SYSTEM")
                .priority("NORMAL")
                .userIds(List.of(1L, 2L))
                .build();

        Message message = Message.builder().id(1L).title("测试标题").build();
        when(notificationService.sendMessage(any(SendMessageRequest.class), eq(1L))).thenReturn(message);

        mockMvc.perform(post("/api/admin/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.title").value("测试标题"));
    }

    @Test
    @DisplayName("POST /api/admin/messages 发送全员广播")
    void sendMessage_broadcast() throws Exception {
        SendMessageRequest request = SendMessageRequest.builder()
                .title("广播标题")
                .content("广播内容")
                .userIds(null)
                .build();

        Message message = Message.builder().id(2L).title("广播标题").build();
        when(notificationService.sendMessage(any(SendMessageRequest.class), eq(1L))).thenReturn(message);

        mockMvc.perform(post("/api/admin/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"));
    }
}
