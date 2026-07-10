package com.miao.toolbox.tool.translate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.tool.translate.dto.DetectResponse;
import com.miao.toolbox.tool.translate.dto.ImageTranslateResponse;
import com.miao.toolbox.tool.translate.dto.TranslateResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("TranslateController 路由与响应格式测试")
class TranslateControllerTest {

    @Mock
    private TranslateService translateService;

    @InjectMocks
    private TranslateController translateController;

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(translateController).build();
    }

    @Test
    @DisplayName("POST /api/translate 返回翻译结果")
    void translate_returnsOk() throws Exception {
        when(translateService.translate(any())).thenReturn(
                TranslateResponse.builder().translatedText("你好").from("en").charCount(5).build());

        mockMvc.perform(post("/api/translate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"hello\",\"from\":\"auto\",\"to\":\"zh\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.translatedText").value("你好"))
                .andExpect(jsonPath("$.data.from").value("en"))
                .andExpect(jsonPath("$.data.charCount").value(5));
    }

    @Test
    @DisplayName("POST /api/translate/detect 返回识别结果")
    void detect_returnsOk() throws Exception {
        when(translateService.detect(any())).thenReturn(
                DetectResponse.builder()
                        .dominant("en")
                        .recommendedTarget("zh")
                        .results(List.of())
                        .build());

        mockMvc.perform(post("/api/translate/detect")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"hello\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.dominant").value("en"))
                .andExpect(jsonPath("$.data.recommendedTarget").value("zh"));
    }

    @Test
    @DisplayName("POST /api/translate/image 返回图片翻译结果")
    void imageTranslate_returnsOk() throws Exception {
        when(translateService.imageTranslate(any(), any(), any())).thenReturn(
                ImageTranslateResponse.builder()
                        .from("zh")
                        .to("en")
                        .blocks(List.of())
                        .sourceText("你好")
                        .translatedText("Hello")
                        .renderedImage("data:image/png;base64,xxx")
                        .build());

        MockMultipartFile file = new MockMultipartFile(
                "image", "img.png", "image/png", "x".getBytes());

        mockMvc.perform(multipart("/api/translate/image")
                        .file(file)
                        .param("from", "auto")
                        .param("to", "en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.from").value("zh"))
                .andExpect(jsonPath("$.data.to").value("en"))
                .andExpect(jsonPath("$.data.translatedText").value("Hello"))
                .andExpect(jsonPath("$.data.renderedImage").value("data:image/png;base64,xxx"));
    }
}
