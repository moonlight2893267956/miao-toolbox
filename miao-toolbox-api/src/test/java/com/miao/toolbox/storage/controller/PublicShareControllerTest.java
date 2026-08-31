package com.miao.toolbox.storage.controller;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.common.exception.GlobalExceptionHandler;
import com.miao.toolbox.storage.dto.ShareInfoDTO;
import com.miao.toolbox.storage.entity.FileEntity;
import com.miao.toolbox.storage.entity.FileShareLinkEntity;
import com.miao.toolbox.storage.service.FileService;
import com.miao.toolbox.storage.service.FileShareLinkService;
import com.miao.toolbox.storage.service.StorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PublicShareController 外链分享访客接口测试")
class PublicShareControllerTest {

    private static final String SHARE_CODE = "Ab3xK9mQpL";
    private static final String TICKET = "unit-test-ticket";

    @Mock private FileShareLinkService fileShareLinkService;
    @Mock private StorageService storageService;
    @Mock private FileService fileService;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        PublicShareController controller =
                new PublicShareController(fileShareLinkService, storageService, fileService);
        mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private FileEntity file() {
        return FileEntity.builder()
                .id(100L)
                .userId(1L)
                .fileName("季度报告.pdf")
                .path("docs")
                .cosKey("files/1/docs/report.pdf")
                .sizeBytes(2048L)
                .mimeType("application/pdf")
                .build();
    }

    private FileShareLinkService.ShareAccessContext context(FileEntity file) {
        FileShareLinkEntity link = FileShareLinkEntity.builder()
                .id(1L)
                .shareCode(SHARE_CODE)
                .fileId(file.getId())
                .userId(1L)
                .build();
        return new FileShareLinkService.ShareAccessContext(link, file);
    }

    @Test
    @DisplayName("GET info：返回分享公开信息，且不含提取码")
    void info() throws Exception {
        when(fileShareLinkService.getShareInfo(SHARE_CODE)).thenReturn(
                ShareInfoDTO.builder()
                        .shareCode(SHARE_CODE)
                        .fileName("季度报告.pdf")
                        .sizeBytes(2048L)
                        .mimeType("application/pdf")
                        .ownerName("阿渺")
                        .status("ACTIVE")
                        .build());

        mvc.perform(get("/api/public/share/{code}/info", SHARE_CODE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.fileName").value("季度报告.pdf"))
                .andExpect(jsonPath("$.data.status").value("ACTIVE"))
                .andExpect(jsonPath("$.data.accessCode").doesNotExist())
                .andExpect(jsonPath("$.data.accessCodeHash").doesNotExist());
    }

    @Test
    @DisplayName("GET info：链接不存在返回 404，绝不是 401")
    void infoNotFound() throws Exception {
        when(fileShareLinkService.getShareInfo("NOTEXIST"))
                .thenThrow(new BusinessException(ErrorCode.SHARE_LINK_NOT_FOUND, "分享不存在", 404));

        mvc.perform(get("/api/public/share/{code}/info", "NOTEXIST"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(ErrorCode.SHARE_LINK_NOT_FOUND));
    }

    @Test
    @DisplayName("POST unlock：校验通过返回票据")
    void unlock() throws Exception {
        when(fileShareLinkService.unlockShare(eq(SHARE_CODE), eq("ABCD"), anyString())).thenReturn(TICKET);

        mvc.perform(post("/api/public/share/{code}/unlock", SHARE_CODE)
                        .contentType("application/json")
                        .content("{\"accessCode\":\"ABCD\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.ticket").value(TICKET));
    }

    @Test
    @DisplayName("POST unlock：提取码错误返回 403 且不是 401（避免访客被弹到登录页）")
    void unlockWrongCode() throws Exception {
        when(fileShareLinkService.unlockShare(eq(SHARE_CODE), eq("ZZZZ"), anyString()))
                .thenThrow(new BusinessException(ErrorCode.SHARE_ACCESS_CODE_INVALID, "提取码错误，还可尝试 4 次", 403));

        mvc.perform(post("/api/public/share/{code}/unlock", SHARE_CODE)
                        .contentType("application/json")
                        .content("{\"accessCode\":\"ZZZZ\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(ErrorCode.SHARE_ACCESS_CODE_INVALID))
                .andExpect(jsonPath("$.message").value("提取码错误，还可尝试 4 次"));
    }

    @Test
    @DisplayName("POST unlock：已过期的分享返回 403")
    void unlockExpired() throws Exception {
        when(fileShareLinkService.unlockShare(eq(SHARE_CODE), any(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.SHARE_LINK_EXPIRED, "该分享已过期", 403));

        mvc.perform(post("/api/public/share/{code}/unlock", SHARE_CODE)
                        .contentType("application/json")
                        .content("{\"accessCode\":\"ABCD\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(ErrorCode.SHARE_LINK_EXPIRED));
    }

    @Test
    @DisplayName("POST unlock：请求体缺失时按空提取码处理，不抛 500")
    void unlockEmptyBody() throws Exception {
        when(fileShareLinkService.unlockShare(eq(SHARE_CODE), isNull(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.SHARE_ACCESS_CODE_INVALID, "提取码错误，还可尝试 4 次", 403));

        mvc.perform(post("/api/public/share/{code}/unlock", SHARE_CODE)
                        .contentType("application/json"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(ErrorCode.SHARE_ACCESS_CODE_INVALID));
    }

    @Test
    @DisplayName("GET preview：返回 inline 的流式内容")
    void preview() throws Exception {
        FileEntity file = file();
        when(fileShareLinkService.resolveShareAccess(SHARE_CODE, TICKET)).thenReturn(context(file));
        when(storageService.getObject("files/1/docs/report.pdf"))
                .thenReturn(new ByteArrayInputStream("PDFDATA".getBytes(StandardCharsets.UTF_8)));

        mvc.perform(get("/api/public/share/{code}/preview", SHARE_CODE).param("st", TICKET))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("inline;")))
                .andExpect(content().string("PDFDATA"));
    }

    @Test
    @DisplayName("GET preview：票据无效返回 403，不是 401")
    void previewInvalidTicket() throws Exception {
        when(fileShareLinkService.resolveShareAccess(SHARE_CODE, "bad-ticket"))
                .thenThrow(new BusinessException(ErrorCode.SHARE_ACCESS_TICKET_INVALID, "访问凭证已失效，请重新输入提取码", 403));

        mvc.perform(get("/api/public/share/{code}/preview", SHARE_CODE).param("st", "bad-ticket"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(ErrorCode.SHARE_ACCESS_TICKET_INVALID));
    }

    @Test
    @DisplayName("GET text-preview：返回文本内容")
    void textPreview() throws Exception {
        FileEntity file = file();
        when(fileShareLinkService.resolveShareAccess(SHARE_CODE, TICKET)).thenReturn(context(file));
        when(fileService.getTextPreview(file)).thenReturn("hello share");

        mvc.perform(get("/api/public/share/{code}/text-preview", SHARE_CODE).param("st", TICKET))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("hello share"))
                .andExpect(jsonPath("$.data.fileName").value("季度报告.pdf"));
    }

    @Test
    @DisplayName("GET text-preview：非文本类型时转成 400，不出现 500")
    void textPreviewNotSupported() throws Exception {
        FileEntity file = file();
        when(fileShareLinkService.resolveShareAccess(SHARE_CODE, TICKET)).thenReturn(context(file));
        when(fileService.getTextPreview(file))
                .thenThrow(new com.miao.toolbox.storage.exception.StorageException(
                        "PREVIEW_NOT_SUPPORTED", "仅支持文本类文件预览", 400));

        mvc.perform(get("/api/public/share/{code}/text-preview", SHARE_CODE).param("st", TICKET))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PREVIEW_NOT_SUPPORTED"));
    }

    @Test
    @DisplayName("GET download：返回 attachment 的下载流")
    void download() throws Exception {
        FileEntity file = file();
        when(fileShareLinkService.resolveShareAccess(SHARE_CODE, TICKET)).thenReturn(context(file));
        when(storageService.getObject("files/1/docs/report.pdf"))
                .thenReturn(new ByteArrayInputStream("PDFDATA".getBytes(StandardCharsets.UTF_8)));

        mvc.perform(get("/api/public/share/{code}/download", SHARE_CODE).param("st", TICKET))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment;")))
                .andExpect(content().string("PDFDATA"));
    }

    @Test
    @DisplayName("GET download：缺少票据参数返回 403")
    void downloadMissingTicket() throws Exception {
        when(fileShareLinkService.resolveShareAccess(eq(SHARE_CODE), any()))
                .thenThrow(new BusinessException(ErrorCode.SHARE_ACCESS_TICKET_INVALID, "缺少访问凭证", 403));

        mvc.perform(get("/api/public/share/{code}/download", SHARE_CODE))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(ErrorCode.SHARE_ACCESS_TICKET_INVALID));
    }
}
