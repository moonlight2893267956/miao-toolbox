package com.miao.toolbox.network.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.network.dto.IpReputationRequest;
import com.miao.toolbox.network.dto.IpReputationResponse;
import com.miao.toolbox.network.infrastructure.AbuseIpdbClient;
import com.miao.toolbox.network.infrastructure.AbuseIpdbException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class IpReputationServiceTest {

    @Mock
    private AbuseIpdbClient abuseIpdbClient;

    @InjectMocks
    private IpReputationService service;

    private IpReputationRequest req(String ip, Integer maxAge) {
        return new IpReputationRequest(ip, maxAge);
    }

    @Test
    void shouldRejectBlankIp() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.check(req("  ", 90)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldRejectDomainAsIp() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.check(req("example.com", 90)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldRejectPrivateIp() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.check(req("192.168.1.1", 90)));
        assertEquals(ErrorCode.NETWORK_INVALID_INPUT, ex.getErrorCode());
    }

    @Test
    void shouldReturnFriendlyWhenNotConfigured() {
        when(abuseIpdbClient.isConfigured()).thenReturn(false);
        IpReputationResponse r = service.check(req("8.8.8.8", 90));
        assertFalse(r.isConfigured());
        assertTrue(r.isSuccess());
        assertNotNull(r.getMessage());
    }

    @Test
    void shouldMapSuccessfulResult() {
        when(abuseIpdbClient.isConfigured()).thenReturn(true);
        IpReputationResponse mock = IpReputationResponse.builder()
            .ip("8.8.8.8")
            .abuseConfidenceScore(10)
            .totalReports(5)
            .build();
        when(abuseIpdbClient.check(eq("8.8.8.8"), eq(90))).thenReturn(mock);

        IpReputationResponse r = service.check(req("8.8.8.8", 90));
        assertTrue(r.isConfigured());
        assertEquals(10, r.getAbuseConfidenceScore());
        assertEquals(5, r.getTotalReports());
    }

    @Test
    void shouldReturnFriendlyOnQuotaExhausted() {
        when(abuseIpdbClient.isConfigured()).thenReturn(true);
        when(abuseIpdbClient.check(anyString(), anyInt())).thenThrow(new AbuseIpdbException(429, "quota"));
        IpReputationResponse r = service.check(req("8.8.8.8", 90));
        assertTrue(r.isSuccess());
        assertTrue(r.getMessage().contains("配额"));
    }
}
