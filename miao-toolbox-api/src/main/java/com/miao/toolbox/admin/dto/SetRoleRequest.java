package com.miao.toolbox.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SetRoleRequest {

    @NotBlank(message = "角色不能为空")
    private String role;
}
