package com.miao.toolbox.admin.dto;

import com.miao.toolbox.auth.dto.RoleBrief;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class AdminUserResponse {

    private Long id;
    private String username;
    private String email;
    private List<RoleBrief> roles;
    private Boolean isEnabled;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
}
