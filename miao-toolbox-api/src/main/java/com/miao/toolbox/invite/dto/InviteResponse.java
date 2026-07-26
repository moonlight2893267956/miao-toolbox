package com.miao.toolbox.invite.dto;

import java.time.LocalDateTime;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class InviteResponse {

    /** 令牌原文，仅返回一次，用于拼接可分享的邀请链接 */
    private String token;

    private Long roleId;

    private String roleName;

    private String roleCode;

    private LocalDateTime expiresAt;
}
