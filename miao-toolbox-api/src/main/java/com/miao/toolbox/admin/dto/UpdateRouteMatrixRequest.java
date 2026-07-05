package com.miao.toolbox.admin.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class UpdateRouteMatrixRequest {
    @NotNull(message = "映射配置不能为空")
    private Map<String, List<Long>> mappings;
}
