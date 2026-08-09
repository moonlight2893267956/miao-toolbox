package com.miao.toolbox.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

@Data
public class SetQuotaRequest {

    /** 配额上限：100TB，防止误填极大值 */
    public static final long MAX_QUOTA_BYTES = 100L * 1024 * 1024 * 1024 * 1024;

    @Min(value = 0, message = "配额不能为负数")
    @Max(value = MAX_QUOTA_BYTES, message = "配额超出上限（100TB）")
    private Long quotaBytes;
}
