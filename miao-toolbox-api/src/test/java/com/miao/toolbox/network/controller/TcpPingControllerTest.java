package com.miao.toolbox.network.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.network.dto.TcpPingRequest;
import com.miao.toolbox.network.dto.TcpPingResponse;
import com.miao.toolbox.network.service.TcpPingService;
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
@DisplayName("TcpPingController")
class TcpPingControllerTest {

    @Mock
    private TcpPingService tcpPingService;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private TcpPingController controller;

    @Test
    @DisplayName("POST /api/network/inspector/tcp-ping 返回 SUCCESS")
    void pingEndpoint() throws Exception {
        TcpPingResponse body = TcpPingResponse.builder()
                .host("example.com")
                .port(443)
                .count(4)
                .successCount(4)
                .failCount(0)
                .probes(List.of())
                .build();
        when(tcpPingService.ping(any(TcpPingRequest.class))).thenReturn(body);

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/network/inspector/tcp-ping")
                        .contentType("application/json")
                        .content("{\"host\":\"example.com\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.host").value("example.com"))
                .andExpect(jsonPath("$.data.port").value(443));
    }

    @Test
    @DisplayName("默认端口与次数规范化")
    void defaultsViaServiceCall() {
        when(tcpPingService.ping(any())).thenAnswer(inv -> {
            TcpPingRequest r = inv.getArgument(0);
            assertThat(r.getPort()).isEqualTo(443);
            assertThat(r.getCount()).isEqualTo(4);
            return TcpPingResponse.builder().host(r.getHost()).port(r.getPort()).count(r.getCount())
                    .successCount(0).failCount(0).probes(List.of()).build();
        });
        TcpPingRequest req = new TcpPingRequest();
        req.setHost("x.com");
        req.setPort(null);
        req.setCount(null);
        ResponseEntity<?> resp = controller.ping(req);
        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
    }
}
