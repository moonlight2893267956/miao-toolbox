package com.miao.toolbox.admin.service;

import com.miao.toolbox.admin.dto.DashboardStatsResponse;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.observability.AiInvocationRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;

import java.lang.reflect.Field;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("DashboardService 单元测试")
class DashboardServiceTest {

    @Mock private AiInvocationRepository aiInvocationRepository;
    @Mock private UserRepository userRepository;
    @Mock private RedisTemplate<String, Object> redisTemplate;

    @InjectMocks private DashboardService dashboardService;

    @BeforeEach
    void injectRedisTemplate() throws Exception {
        // DashboardService 中 redisTemplate 是 @Autowired(required=false) 字段注入
        Field field = DashboardService.class.getDeclaredField("redisTemplate");
        field.setAccessible(true);
        field.set(dashboardService, redisTemplate);
    }

    @Nested
    @DisplayName("getStats 仪表盘统计")
    class GetStatsTests {

        @Test
        @DisplayName("返回正确的统计数据")
        void returnCorrectStats() {
            when(aiInvocationRepository.countSince(any())).thenReturn(100L);
            when(aiInvocationRepository.countFailuresSince(any())).thenReturn(5L);
            when(aiInvocationRepository.countDistinctUsersSince(any())).thenReturn(10L);
            when(userRepository.count()).thenReturn(50L);
            when(aiInvocationRepository.agentCallDistribution(any())).thenReturn(List.of());
            when(aiInvocationRepository.dailyFailureCounts(any())).thenReturn(List.of());
            when(redisTemplate.keys(anyString())).thenReturn(null);

            DashboardStatsResponse stats = dashboardService.getStats();

            assertThat(stats.getTodayTotalCalls()).isEqualTo(100L);
            assertThat(stats.getTodayErrorCalls()).isEqualTo(5L);
            assertThat(stats.getOnlineUsers()).isEqualTo(10L);
            assertThat(stats.getTotalUsers()).isEqualTo(50L);
            assertThat(stats.getRateLimitHits()).isEqualTo(0L);
            assertThat(stats.getErrorTrend7d()).hasSize(7);
            verify(aiInvocationRepository).countSince(any());
            verify(aiInvocationRepository).countFailuresSince(any());
            verify(aiInvocationRepository).countDistinctUsersSince(any());
            verify(userRepository).count();
        }

        @Test
        @DisplayName("7天异常趋势补全空日期")
        void fillEmptyDays() {
            when(aiInvocationRepository.countSince(any())).thenReturn(0L);
            when(aiInvocationRepository.countFailuresSince(any())).thenReturn(0L);
            when(aiInvocationRepository.countDistinctUsersSince(any())).thenReturn(0L);
            when(userRepository.count()).thenReturn(0L);
            when(aiInvocationRepository.agentCallDistribution(any())).thenReturn(List.of());
            when(aiInvocationRepository.dailyFailureCounts(any())).thenReturn(List.of());
            when(redisTemplate.keys(anyString())).thenReturn(null);

            DashboardStatsResponse stats = dashboardService.getStats();

            List<DashboardStatsResponse.DailyErrorCount> trend = stats.getErrorTrend7d();
            assertThat(trend).hasSize(7);
            assertThat(trend).allMatch(d -> d.getCount() == 0L);
        }

        @Test
        @DisplayName("Redis 异常时速率限制计数返回0")
        void redisExceptionReturnsZero() {
            when(aiInvocationRepository.countSince(any())).thenReturn(0L);
            when(aiInvocationRepository.countFailuresSince(any())).thenReturn(0L);
            when(aiInvocationRepository.countDistinctUsersSince(any())).thenReturn(0L);
            when(userRepository.count()).thenReturn(0L);
            when(aiInvocationRepository.agentCallDistribution(any())).thenReturn(List.of());
            when(aiInvocationRepository.dailyFailureCounts(any())).thenReturn(List.of());
            when(redisTemplate.keys(anyString())).thenThrow(new RuntimeException("Redis down"));

            DashboardStatsResponse stats = dashboardService.getStats();

            assertThat(stats.getRateLimitHits()).isEqualTo(0L);
        }

        @Test
        @DisplayName("redisTemplate 为 null 时速率限制计数返回0")
        void nullRedisReturnsZero() throws Exception {
            Field field = DashboardService.class.getDeclaredField("redisTemplate");
            field.setAccessible(true);
            field.set(dashboardService, null);

            when(aiInvocationRepository.countSince(any())).thenReturn(0L);
            when(aiInvocationRepository.countFailuresSince(any())).thenReturn(0L);
            when(aiInvocationRepository.countDistinctUsersSince(any())).thenReturn(0L);
            when(userRepository.count()).thenReturn(0L);
            when(aiInvocationRepository.agentCallDistribution(any())).thenReturn(List.of());
            when(aiInvocationRepository.dailyFailureCounts(any())).thenReturn(List.of());

            DashboardStatsResponse stats = dashboardService.getStats();

            assertThat(stats.getRateLimitHits()).isEqualTo(0L);
        }
    }
}
