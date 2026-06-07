package com.miao.toolbox.auth.oauth;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class GitHubUser {
    private Long id;
    private String login;
    private String name;
    private String email;

    @JsonProperty("avatar_url")
    private String avatarUrl;
}
