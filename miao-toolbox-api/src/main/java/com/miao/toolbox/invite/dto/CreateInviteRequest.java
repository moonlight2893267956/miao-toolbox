package com.miao.toolbox.invite.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

@Data
public class CreateInviteRequest {

    @Min(1)
    @Max(365)
    private Integer expiresInDays = 7;
}
