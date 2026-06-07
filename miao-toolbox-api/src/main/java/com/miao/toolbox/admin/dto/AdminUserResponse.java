package com.miao.toolbox.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AdminUserResponse {

    private Long id;
    private String username;
    private String email;
    private String role;
    private Boolean isEnabled;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
}
