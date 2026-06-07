package com.miao.toolbox.user.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UserInfoResponse {
    private Long id;
    private String username;
    private String role;
    private String githubId;
    private String githubUsername;
    private String googleId;
    private String googleUsername;
    private boolean mustChangePassword;
}