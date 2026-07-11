package com.miao.toolbox.tool.translate;

import com.miao.toolbox.tool.translate.dto.AiEnhanceResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("AiEnhanceController 路由与响应格式测试")
class AiEnhanceControllerTest {

    @Mock
    private AiEnhanceService aiEnhanceService;

    @InjectMocks
    private AiEnhanceController aiEnhanceController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(aiEnhanceController).build();
    }

    @Test
    @DisplayName("POST /api/translate/enhance 成功返回译文")
    void enhance_success() throws Exception {
        AiEnhanceResponse resp = new AiEnhanceResponse();
        resp.setTask("translate");
        resp.setTranslated("Hello");
        when(aiEnhanceService.enhance(any())).thenReturn(resp);

        mockMvc.perform(post("/api/translate/enhance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"你好\",\"targetLang\":\"en\",\"tone\":\"formal\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.translated").value("Hello"))
                .andExpect(jsonPath("$.data.task").value("translate"));
    }

    @Test
    @DisplayName("POST /api/translate/enhance 空文本 → 400")
    void enhance_emptyText_returns400() throws Exception {
        mockMvc.perform(post("/api/translate/enhance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"\",\"targetLang\":\"en\"}"))
                .andExpect(status().isBadRequest());
    }
}
