package com.miao.toolbox.observability;

import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.common.response.PagedResponse;
import com.miao.toolbox.observability.dto.AiInvocationQuery;
import com.miao.toolbox.observability.dto.AiInvocationResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

/**
 * AiInvocationQueryService 单元测试。
 */
@ExtendWith(MockitoExtension.class)
class AiInvocationQueryServiceTest {

    @Mock
    private AiInvocationRepository repository;

    @Mock
    private UserRepository userRepository;

    private AiInvocationQueryService createService() {
        return new AiInvocationQueryService(repository, userRepository);
    }

    @Test
    void shouldParseLocalDateTimeWithoutZone() {
        AiInvocationQueryService service = createService();
        LocalDateTime now = LocalDateTime.of(2026, 7, 9, 23, 30, 0);
        when(repository.findByFilters(
                isNull(), isNull(), isNull(), isNull(), isNull(),
                eq(now.minusHours(24)), eq(now), any()))
                .thenReturn(emptyPage());

        AiInvocationQuery query = new AiInvocationQuery();
        query.setStartTime("2026-07-08T23:30:00");
        query.setEndTime("2026-07-09T23:30:00");

        PagedResponse<AiInvocationResponse> result = service.queryLogs(query);

        assertThat(result).isNotNull();
    }

    @Test
    void shouldParseUtcIsoWithZ() {
        AiInvocationQueryService service = createService();
        // 东八区服务器：2026-07-09T15:30:00Z => 2026-07-09T23:30:00
        LocalDateTime expected = ZonedDateTime.parse("2026-07-09T15:30:00Z")
                .withZoneSameInstant(ZoneId.systemDefault())
                .toLocalDateTime();
        when(repository.findByFilters(
                isNull(), isNull(), isNull(), isNull(), isNull(),
                eq(expected), isNull(), any()))
                .thenReturn(emptyPage());

        AiInvocationQuery query = new AiInvocationQuery();
        query.setStartTime("2026-07-09T15:30:00Z");

        PagedResponse<AiInvocationResponse> result = service.queryLogs(query);

        assertThat(result).isNotNull();
    }

    @Test
    void shouldFallbackToDefaultWhenFormatInvalid() {
        AiInvocationQueryService service = createService();
        when(repository.findByFilters(
                isNull(), isNull(), isNull(), isNull(), isNull(),
                any(), isNull(), any()))
                .thenReturn(emptyPage());

        AiInvocationQuery query = new AiInvocationQuery();
        query.setStartTime("not-a-valid-time");

        PagedResponse<AiInvocationResponse> result = service.queryLogs(query);

        assertThat(result).isNotNull();
    }

    private Page<AiInvocation> emptyPage() {
        return new PageImpl<>(List.of());
    }
}
