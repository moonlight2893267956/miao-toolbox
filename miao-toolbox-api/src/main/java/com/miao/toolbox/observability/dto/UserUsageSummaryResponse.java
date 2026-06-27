package com.miao.toolbox.observability.dto;

import lombok.Data;

/**
 * 用户 AI 用量统计响应 DTO。
 */
@Data
public class UserUsageSummaryResponse {

    /** 总调用次数 */
    private long totalCalls;
    /** 累计 Token */
    private long totalTokens;
    /** 失败率（0.0 ~ 1.0） */
    private double failureRate;
    /** 最近调用时间 */
    private String lastCalledAt;
    /** 涉及 Agent 数 */
    private long agentCount;
    /** 涉及 Model 数 */
    private long modelCount;
}
