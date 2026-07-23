package com.miao.toolbox.network.dto;

import lombok.Builder;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
public class TcpPingResponse {

    private String host;
    private int port;
    private String resolvedIp;
    private int count;
    private int successCount;
    private int failCount;
    /** 成功样本平均延迟 ms，无成功则为 null */
    private Double avgLatencyMs;
    @Builder.Default
    private List<TcpPingProbe> probes = new ArrayList<>();

    @Data
    @Builder
    public static class TcpPingProbe {
        private int seq;
        private boolean success;
        /** 延迟毫秒；失败时可为 null */
        private Long latencyMs;
        private String errorCode;
        private String message;
    }
}
