package com.miao.toolbox.network.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.GraphqlProxyRequest;
import com.miao.toolbox.network.dto.GraphqlProxyResult;
import com.miao.toolbox.network.infrastructure.HttpFetcher;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class GraphqlProxyServiceTest {

    @Mock
    private HttpFetcher httpFetcher;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private GraphqlProxyService service;

    @BeforeEach
    void setUp() {
        service = new GraphqlProxyService(httpFetcher, objectMapper);
    }

    @Test
    void proxy_buildsPayloadAndReturnsResult() throws Exception {
        HttpFetcher.HttpFetchResult r = new HttpFetcher.HttpFetchResult(
                200, "OK", "http://x/", new HashMap<>(), 12L, "{\"data\":{}}");
        when(httpFetcher.fetchWithBody(anyString(), eq("POST"), any(), anyString(), anyLong()))
                .thenReturn(r);

        GraphqlProxyRequest req = new GraphqlProxyRequest();
        req.setEndpoint("http://x/");
        req.setQuery("query X");
        req.setOperationName("op");
        req.setVariables("{\"id\":1}");

        GraphqlProxyResult res = service.proxy(req);

        assertEquals(200, res.getStatusCode());
        assertEquals("{\"data\":{}}", res.getBody());

        ArgumentCaptor<String> bodyCap = ArgumentCaptor.forClass(String.class);
        verify(httpFetcher).fetchWithBody(eq("http://x/"), eq("POST"), isNull(), bodyCap.capture(), eq(0L));
        JsonNode node = objectMapper.readTree(bodyCap.getValue());
        assertEquals("query X", node.get("query").asText());
        assertEquals("op", node.get("operationName").asText());
        assertEquals(1, node.get("variables").get("id").asInt());
    }

    @Test
    void proxy_invalidVariables_throws() {
        GraphqlProxyRequest req = new GraphqlProxyRequest();
        req.setEndpoint("http://x/");
        req.setQuery("q");
        req.setVariables("{bad json");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.proxy(req));
        assertTrue(ex.getMessage().contains("Variables"));
    }

    @Test
    void proxy_propagatesFetchError() {
        when(httpFetcher.fetchWithBody(anyString(), anyString(), any(), anyString(), anyLong()))
                .thenThrow(new BusinessException("NETWORK_SSRF_BLOCKED", "blocked", 403));

        GraphqlProxyRequest req = new GraphqlProxyRequest();
        req.setEndpoint("http://x/");
        req.setQuery("q");

        assertThrows(BusinessException.class, () -> service.proxy(req));
    }
}
