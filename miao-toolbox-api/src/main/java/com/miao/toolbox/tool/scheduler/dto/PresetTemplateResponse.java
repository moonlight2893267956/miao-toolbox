package com.miao.toolbox.tool.scheduler.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * 预置运维模板元信息响应（FR-5）——GET /api/scheduler/preset-templates。
 *
 * <p>来自 {@code PresetTemplateHandler} 的注册信息，前端据此动态渲染
 * 模板选择器与参数表单，新增模板无需前端发版。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresetTemplateResponse {

    /** 模板代码（提交 targetConfig.template 的取值） */
    private String code;

    /** 显示名（中文） */
    private String name;

    /** 用途描述 */
    private String description;

    /** 参数 schema：参数名 → 描述 */
    private Map<String, String> params;
}
