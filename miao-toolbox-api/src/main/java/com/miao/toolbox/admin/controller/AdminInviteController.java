package com.miao.toolbox.admin.controller;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.invite.dto.CreateInviteRequest;
import com.miao.toolbox.invite.dto.InviteResponse;
import com.miao.toolbox.invite.service.InviteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/roles")
@RequiredArgsConstructor
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class AdminInviteController {

    private final InviteService inviteService;

    @PostMapping("/{roleId}/invites")
    public ResponseEntity<ApiResponse<InviteResponse>> createInvite(
            @PathVariable Long roleId,
            @Valid @RequestBody CreateInviteRequest request,
            @AuthenticationPrincipal Object principal) {
        Long operatorId = extractUserId(principal);
        InviteResponse response = inviteService.createInvite(roleId, operatorId, request.getExpiresInDays());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private Long extractUserId(Object principal) {
        if (principal instanceof User user) {
            return user.getId();
        }
        return null;
    }
}
