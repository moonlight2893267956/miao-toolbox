package com.miao.toolbox.network.dto;

import lombok.Builder;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
public class PortScanResponse {

    private String host;
    private String resolvedIp;
    /** 扫描的端口总数 */
    private int totalPorts;
    /** 开放端口数 */
    private int openCount;
    /** 关闭/不可达端口数 */
    private int closedCount;
    /** 端口范围表达式 */
    private String portRange;
    /** 耗时毫秒 */
    private long elapsedMs;
    @Builder.Default
    private List<PortScanProbe> probes = new ArrayList<>();

    @Data
    @Builder
    public static class PortScanProbe {
        private int port;
        private boolean open;
        /** 延迟毫秒；关闭时可为 null */
        private Long latencyMs;
        /** 服务名（如 HTTP、SSH），仅开放端口有值 */
        private String service;
        private String errorCode;
        private String message;
    }
}
