package com.miao.toolbox.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AdminRoleResponse {

    private Long id;
    private String code;
    private String name;
    private String description;
    private Boolean isSystem;
    private Long userCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
