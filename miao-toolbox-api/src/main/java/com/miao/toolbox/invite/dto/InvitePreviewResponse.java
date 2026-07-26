package com.miao.toolbox.invite.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class InvitePreviewResponse {

    private boolean valid;

    private String roleName;

    public static InvitePreviewResponse valid(String roleName) {
        return InvitePreviewResponse.builder().valid(true).roleName(roleName).build();
    }

    public static InvitePreviewResponse invalid() {
        return InvitePreviewResponse.builder().valid(false).build();
    }
}
