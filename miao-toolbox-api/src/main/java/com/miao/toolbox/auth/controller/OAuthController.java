package com.miao.toolbox.auth.controller;

import com.miao.toolbox.auth.dto.LoginResponse;
import com.miao.toolbox.auth.oauth.OAuthProperties;
import com.miao.toolbox.auth.oauth.GitHubOAuthService;
import com.miao.toolbox.common.response.ApiResponse;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/api/auth/oauth")
@RequiredArgsConstructor
public class OAuthController {

    private final GitHubOAuthService gitHubOAuthService;
    private final OAuthProperties oAuthProperties;

    @GetMapping("/github")
    public void authorizeGithub(HttpServletResponse response) throws IOException {
        response.sendRedirect(gitHubOAuthService.buildAuthorizationUrl());
    }

    @GetMapping("/github/callback")
    public void githubCallback(
            @RequestParam("code") String code,
            HttpServletResponse response) throws IOException {
        LoginResponse loginResponse = gitHubOAuthService.handleCallback(code, response);

        // Redirect to frontend with tokens via URL fragment (or query params for simplicity)
        String redirectUrl = oAuthProperties.getFrontendCallbackUrl()
                + "?token=" + loginResponse.getAccessToken()
                + "&signingKey=" + loginResponse.getSigningKey()
                + "&userId=" + loginResponse.getUser().getId()
                + "&username=" + loginResponse.getUser().getUsername()
                + "&role=" + loginResponse.getUser().getRole();

        response.sendRedirect(redirectUrl);
    }
}
