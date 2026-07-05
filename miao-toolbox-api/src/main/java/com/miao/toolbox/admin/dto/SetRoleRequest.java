package com.miao.toolbox.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 角色分配请求。校验由 Service 层统一处理（返回 422 + 自定义错误格式）。
 */
@Data
public class SetRoleRequest {

    private List<Long> roleIds;
}
