package com.miao.toolbox.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

@Data
public class SetRateLimitRequest {

    @Min(value = 1, message = "每分钟最大请求数不能小于1")
    @Max(value = 10000, message = "每分钟最大请求数不能超过10000")
    private int maxRequestsPerMinute;
}
