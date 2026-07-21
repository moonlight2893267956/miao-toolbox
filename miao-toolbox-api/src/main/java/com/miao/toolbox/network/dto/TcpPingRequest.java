package com.miao.toolbox.network.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class TcpPingRequest {

    /** 主机名或 IP */
    @NotBlank(message = "主机名不能为空")
    private String host;

    /** 目标端口，默认 443 */
    @Min(value = 1, message = "端口须在 1–65535")
    @Max(value = 65535, message = "端口须在 1–65535")
    private Integer port = 443;

    /** 探测次数：默认 4，最大 30 */
    @Min(value = 1, message = "次数至少为 1")
    @Max(value = 30, message = "次数最多 30")
    private Integer count = 4;

    /** 探测间隔（毫秒），仅连续/SSE 模式生效；默认 1000，范围 0–5000 */
    @Min(value = 0, message = "间隔不能为负")
    @Max(value = 5000, message = "间隔最多 5000ms")
    private Integer intervalMs = 1000;
}
