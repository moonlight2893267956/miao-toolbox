package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class PortScanRequest {

    /** 主机名或 IP */
    @NotBlank(message = "主机名不能为空")
    private String host;

    /** 端口范围表达式，如 "80,443" 或 "1-1024" 或 "common"；默认 "common" */
    private String portRange = "common";

    /** 并发数：默认 10，最大 20 */
    @Min(value = 1, message = "并发数至少为 1")
    @Max(value = 20, message = "并发数最多 20")
    private Integer concurrency = 10;

    /** 单端口连接超时毫秒：默认 3000，范围 500–10000 */
    @Min(value = 500, message = "超时至少 500ms")
    @Max(value = 10000, message = "超时最多 10000ms")
    private Integer timeoutMs = 3000;
}
