package com.miao.toolbox.network.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * AbuseIPDB 单条举报记录（精简）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "AbuseIPDB 举报记录")
public class IpReputationReport {

    @Schema(description = "举报时间", example = "2024-01-01T00:00:00+00:00")
    private String reportedAt;

    @Schema(description = "举报说明", example = "SSH 暴力破解尝试")
    private String comment;

    @Schema(description = "举报分类编码", example = "[18, 22]")
    private List<Integer> categories = new ArrayList<>();
}
