package com.miao.toolbox.network.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.network.dto.DnsQueryRequest;
import com.miao.toolbox.network.dto.DnsQueryResponse;
import com.miao.toolbox.network.dto.DnsRecord;
import com.miao.toolbox.network.service.DnsQueryService;
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
@DisplayName("DnsQueryController")
class DnsQueryControllerTest {

    @Mock
    private DnsQueryService dnsQueryService;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private DnsQueryController controller;

    @Test
    @DisplayName("POST /api/network/inspector/dns-query 返回 SUCCESS")
    void queryEndpoint() throws Exception {
        DnsQueryResponse body = DnsQueryResponse.builder()
                .domain("example.com")
                .queryTypes(List.of("A", "AAAA"))
                .dnsServer("system-default")
                .records(List.of(DnsRecord.builder().name("example.com.").type("A").ttl(300L).value("1.2.3.4").build()))
                .total(1)
                .build();
        when(dnsQueryService.query(any(DnsQueryRequest.class))).thenReturn(body);

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/network/inspector/dns-query")
                        .contentType("application/json")
                        .content("{\"domain\":\"example.com\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.domain").value("example.com"))
                .andExpect(jsonPath("$.data.total").value(1));
    }

    @Test
    @DisplayName("空域名 → 校验失败 400")
    void blankDomainRejected() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/network/inspector/dns-query")
                        .contentType("application/json")
                        .content("{\"domain\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("经服务层返回响应对象")
    void returnsResponseEntity() {
        when(dnsQueryService.query(any())).thenAnswer(inv -> {
            DnsQueryRequest r = inv.getArgument(0);
            return DnsQueryResponse.builder().domain(r.getDomain()).queryTypes(List.of("A")).dnsServer("system-default").records(List.of()).total(0).build();
        });
        DnsQueryRequest req = new DnsQueryRequest();
        req.setDomain("x.com");
        ResponseEntity<?> resp = controller.query(req);
        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
    }
}
