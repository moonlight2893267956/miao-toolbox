package com.miao.toolbox.admin.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AdminRouteResponse {
    private Long id;
    private String code;
    private String name;
    private String path;
    private String category;
    private String icon;
    private Integer sortOrder;
    private Boolean isAdminRoute;
    private Boolean isEnabled;
}
