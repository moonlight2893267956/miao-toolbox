package com.miao.toolbox.tool.translate;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.proxy.client.BaiduTranslateClient;
import com.miao.toolbox.tool.translate.dto.DetectRequest;
import com.miao.toolbox.tool.translate.dto.DetectResponse;
import com.miao.toolbox.tool.translate.dto.ImageTranslateResponse;
import com.miao.toolbox.tool.translate.dto.SpeechTranslateRequest;
import com.miao.toolbox.tool.translate.dto.SpeechTranslateResponse;
import com.miao.toolbox.tool.translate.dto.TranslateRequest;
import com.miao.toolbox.tool.translate.dto.TranslateResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("TranslateService 业务编排测试")
class TranslateServiceTest {

    @Mock
    private BaiduTranslateClient baiduTranslateClient;

    private TranslateService service;

    @BeforeEach
    void setUp() {
        service = new TranslateService(baiduTranslateClient);
    }

    @Test
    @DisplayName("translate 映射为前端响应（译文拼接 + 源语言 + 字符数）")
    void translate_mapsResponse() {
        when(baiduTranslateClient.translate(eq("hello\nhi"), eq("auto"), eq("zh")))
                .thenReturn(new BaiduTranslateClient.TranslateResult("en", "zh",
                        List.of(
                                new BaiduTranslateClient.TranslateItem("hello", "你好"),
                                new BaiduTranslateClient.TranslateItem("hi", "嗨"))));

        TranslateRequest req = new TranslateRequest();
        req.setText("hello\nhi");
        req.setFrom("auto");
        req.setTo("zh");

        TranslateResponse resp = service.translate(req);

        assertEquals("你好\n嗨", resp.getTranslatedText());
        assertEquals("en", resp.getFrom());
        assertEquals(8, resp.getCharCount());
    }

    @Test
    @DisplayName("detect 非中文源 → 推荐中文")
    void detect_recommendsChinese() {
        when(baiduTranslateClient.detectLanguage("bonjour"))
                .thenReturn(new BaiduTranslateClient.DetectResult("fr", 0.9,
                        List.of(new BaiduTranslateClient.DetectedLanguage("fr", 0.9))));

        DetectRequest req = new DetectRequest();
        req.setText("bonjour");

        DetectResponse resp = service.detect(req);

        assertEquals("fr", resp.getDominant());
        assertEquals("zh", resp.getRecommendedTarget());
        assertEquals(1, resp.getResults().size());
    }

    @Test
    @DisplayName("detect 中文源 → 推荐英语（FR-7）")
    void detect_zh_recommendsEnglish() {
        when(baiduTranslateClient.detectLanguage("你好"))
                .thenReturn(new BaiduTranslateClient.DetectResult("zh", 1.0,
                        List.of(new BaiduTranslateClient.DetectedLanguage("zh", 1.0))));

        DetectRequest req = new DetectRequest();
        req.setText("你好");

        DetectResponse resp = service.detect(req);

        assertEquals("zh", resp.getDominant());
        assertEquals("en", resp.getRecommendedTarget());
    }

    @Test
    @DisplayName("translate 目标语言为空 → 校验异常 400")
    void translate_emptyTo_throws() {
        TranslateRequest req = new TranslateRequest();
        req.setText("x");
        req.setTo("  ");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.translate(req));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("detect 文本为空 → 校验异常 400")
    void detect_emptyText_throws() {
        DetectRequest req = new DetectRequest();
        req.setText("");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.detect(req));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("imageTranslate 映射为前端响应（blocks/source/translated/rendered）")
    void imageTranslate_mapsResponse() throws IOException {
        byte[] bytes = "img".getBytes(StandardCharsets.UTF_8);
        List<BaiduTranslateClient.ImageTextBlock> blocks = List.of(
                new BaiduTranslateClient.ImageTextBlock("你好", "Hello", "79 23 246 43",
                        List.of(new BaiduTranslateClient.ImagePoint(254, 280)), "blockImg"));
        when(baiduTranslateClient.imageTranslate(eq(bytes), eq("auto"), eq("en")))
                .thenReturn(new BaiduTranslateClient.ImageTranslateResult(
                        "zh", "en", blocks, "你好", "Hello", "pasteImg"));

        MockMultipartFile file = new MockMultipartFile("image", "img.png", "image/png", bytes);
        ImageTranslateResponse resp = service.imageTranslate(file, "auto", "en");

        assertEquals("zh", resp.getFrom());
        assertEquals("en", resp.getTo());
        assertEquals(1, resp.getBlocks().size());
        assertEquals("你好", resp.getBlocks().get(0).getSrc());
        assertEquals("Hello", resp.getBlocks().get(0).getDst());
        assertEquals(254, resp.getBlocks().get(0).getPoints().get(0).getX());
        assertEquals("你好", resp.getSourceText());
        assertEquals("Hello", resp.getTranslatedText());
        assertEquals("pasteImg", resp.getRenderedImage());
    }

    @Test
    @DisplayName("imageTranslate 图片为空 → 400")
    void imageTranslate_empty_throws() {
        MockMultipartFile file = new MockMultipartFile("image", "", "image/png", new byte[0]);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.imageTranslate(file, "auto", "en"));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("imageTranslate 目标语言为空 → 400")
    void imageTranslate_emptyTo_throws() {
        MockMultipartFile file = new MockMultipartFile("image", "img.png", "image/png", "x".getBytes());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.imageTranslate(file, "auto", "  "));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("imageTranslate 超过 4MB → 400")
    void imageTranslate_tooLarge_throws() {
        byte[] big = new byte[4 * 1024 * 1024 + 1];
        MockMultipartFile file = new MockMultipartFile("image", "img.png", "image/png", big);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.imageTranslate(file, "auto", "en"));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("imageTranslate 读取图片失败 → 400")
    void imageTranslate_readFails_throws() throws IOException {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getSize()).thenReturn(10L);
        when(file.getBytes()).thenThrow(new IOException("boom"));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.imageTranslate(file, "auto", "en"));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("speechTranslate 映射为前端响应（source/target/from/to）")
    void speechTranslate_mapsResponse() throws IOException {
        byte[] bytes = "audio".getBytes(StandardCharsets.UTF_8);
        when(baiduTranslateClient.speechTranslate(eq(bytes), eq("wav"), eq("auto"), eq("en")))
                .thenReturn(new BaiduTranslateClient.SpeechTranslateResult("Hello", "你好"));

        MockMultipartFile file = new MockMultipartFile("voice", "rec.wav", "audio/wav", bytes);
        SpeechTranslateRequest req = new SpeechTranslateRequest();
        req.setVoice(file);
        req.setFrom("auto");
        req.setTo("en");
        req.setFormat("wav");

        SpeechTranslateResponse resp = service.speechTranslate(req);

        assertEquals("auto", resp.getFrom());
        assertEquals("en", resp.getTo());
        assertEquals("Hello", resp.getSourceText());
        assertEquals("你好", resp.getTranslatedText());
    }

    @Test
    @DisplayName("speechTranslate 录音为空 → 400")
    void speechTranslate_empty_throws() {
        MockMultipartFile file = new MockMultipartFile("voice", "", "audio/wav", new byte[0]);
        SpeechTranslateRequest req = new SpeechTranslateRequest();
        req.setVoice(file);
        req.setTo("en");
        req.setFormat("wav");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.speechTranslate(req));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("speechTranslate 目标语言为空 → 400")
    void speechTranslate_emptyTo_throws() {
        MockMultipartFile file = new MockMultipartFile("voice", "rec.wav", "audio/wav", "x".getBytes());
        SpeechTranslateRequest req = new SpeechTranslateRequest();
        req.setVoice(file);
        req.setTo("  ");
        req.setFormat("wav");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.speechTranslate(req));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("speechTranslate 超过 2MB → 400")
    void speechTranslate_tooLarge_throws() {
        byte[] big = new byte[2 * 1024 * 1024 + 1];
        MockMultipartFile file = new MockMultipartFile("voice", "rec.wav", "audio/wav", big);
        SpeechTranslateRequest req = new SpeechTranslateRequest();
        req.setVoice(file);
        req.setTo("en");
        req.setFormat("wav");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.speechTranslate(req));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("speechTranslate 格式非法（webm）→ 400 友好提示")
    void speechTranslate_unsupportedFormat_throws() {
        byte[] bytes = "audio".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile("voice", "rec.webm", "audio/webm", bytes);
        SpeechTranslateRequest req = new SpeechTranslateRequest();
        req.setVoice(file);
        req.setTo("en");
        req.setFormat("webm");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.speechTranslate(req));
        assertEquals(400, ex.getHttpStatus());
    }

    @Test
    @DisplayName("speechTranslate 缺省 format 从文件名扩展名推断为 wav")
    void speechTranslate_resolvesFormatFromFilename() throws IOException {
        byte[] bytes = "audio".getBytes(StandardCharsets.UTF_8);
        when(baiduTranslateClient.speechTranslate(eq(bytes), eq("wav"), eq("auto"), eq("en")))
                .thenReturn(new BaiduTranslateClient.SpeechTranslateResult("Hello", "你好"));

        MockMultipartFile file = new MockMultipartFile("voice", "rec.wav", "audio/wav", bytes);
        SpeechTranslateRequest req = new SpeechTranslateRequest();
        req.setVoice(file);
        req.setFrom("auto");
        req.setTo("en");

        SpeechTranslateResponse resp = service.speechTranslate(req);
        assertEquals("你好", resp.getTranslatedText());
    }
}
