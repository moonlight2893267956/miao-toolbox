package com.miao.toolbox.observability.dto;

import lombok.Data;

/**
 * 调用日志查询条件 DTO。
 */
@Data
public class AiInvocationQuery {

    /** 开始时间（默认 7 天前） */
    private String startTime;

    /** 结束时间（默认当前） */
    private String endTime;

    /** 用户 ID（精确匹配） */
    private Long userId;

    /** Agent 名称 */
    private String agentName;

    /** 模型名称 */
    private String model;

    /** 状态：SUCCESS / FAILURE */
    private String status;

    /** 页码（从 1 开始） */
    private int page = 1;

    /** 每页条数 */
    private int pageSize = 20;
}
