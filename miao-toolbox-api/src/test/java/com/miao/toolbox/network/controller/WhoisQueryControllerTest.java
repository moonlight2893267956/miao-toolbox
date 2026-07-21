package com.miao.toolbox.network.controller;

import com.miao.toolbox.network.dto.WhoisField;
import com.miao.toolbox.network.dto.WhoisQueryRequest;
import com.miao.toolbox.network.dto.WhoisQueryResponse;
import com.miao.toolbox.network.service.WhoisQueryService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("WhoisQueryController")
class WhoisQueryControllerTest {

    @Mock
    private WhoisQueryService whoisQueryService;

    @InjectMocks
    private WhoisQueryController controller;

    @Test
    @DisplayName("POST /api/network/inspector/whois 返回 SUCCESS")
    void queryEndpoint() throws Exception {
        WhoisQueryResponse body = WhoisQueryResponse.builder()
                .target("example.com")
                .queryType("DOMAIN")
                .whoisServer("whois.verisign-grs.com")
                .fields(List.of(WhoisField.builder().key("注册商").value("MarkMonitor").build()))
                .raw("Domain Name: EXAMPLE.COM")
                .found(true)
                .build();
        when(whoisQueryService.query(any(WhoisQueryRequest.class))).thenReturn(body);

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/network/inspector/whois")
                        .contentType("application/json")
                        .content("{\"target\":\"example.com\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.target").value("example.com"))
                .andExpect(jsonPath("$.data.queryType").value("DOMAIN"))
                .andExpect(jsonPath("$.data.fields[0].value").value("MarkMonitor"));
    }

    @Test
    @DisplayName("空目标 → 校验失败 400")
    void blankTargetRejected() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/network/inspector/whois")
                        .contentType("application/json")
                        .content("{\"target\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("经服务层返回响应对象")
    void returnsResponseEntity() {
        when(whoisQueryService.query(any())).thenAnswer(inv -> {
            WhoisQueryRequest r = inv.getArgument(0);
            return WhoisQueryResponse.builder().target(r.getTarget()).queryType("DOMAIN")
                    .whoisServer("whois.iana.org").fields(List.of()).raw("").found(false).build();
        });
        WhoisQueryRequest req = new WhoisQueryRequest();
        req.setTarget("x.com");
        ResponseEntity<?> resp = controller.query(req);
        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
    }
}
