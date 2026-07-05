package com.miao.toolbox.admin.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateRoleRequest {

    @Size(min = 2, max = 20, message = "角色名称长度需在 2-20 之间")
    private String name;

    @Size(max = 100, message = "角色描述不能超过 100 字符")
    private String description;
}
