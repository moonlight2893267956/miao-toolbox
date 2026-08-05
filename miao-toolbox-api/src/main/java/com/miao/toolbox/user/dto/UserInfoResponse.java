package com.miao.toolbox.user.dto;

import com.miao.toolbox.auth.dto.RoleBrief;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class UserInfoResponse {
    private Long id;
    private String username;
    private String email;
    private boolean emailVerified;
    private List<RoleBrief> roles;
    private String githubId;
    private String githubUsername;
    private String googleId;
    private String googleUsername;
    private String avatarUrl;
    private boolean mustChangePassword;
}