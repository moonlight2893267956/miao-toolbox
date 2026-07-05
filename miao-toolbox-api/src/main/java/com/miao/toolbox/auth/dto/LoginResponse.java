package com.miao.toolbox.auth.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.util.List;

@Data
@AllArgsConstructor
@Builder
public class LoginResponse {

    private String accessToken;
    private String signingKey;
    private Boolean mustChangePassword;
    private UserInfo user;

    @Data
    @AllArgsConstructor
    @Builder
    public static class UserInfo {
        private Long id;
        private String username;
        private List<RoleBrief> roles;
    }
}
