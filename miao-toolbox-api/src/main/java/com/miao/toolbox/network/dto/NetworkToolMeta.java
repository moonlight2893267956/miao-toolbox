package com.miao.toolbox.network.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 网络工具元数据，对应 resources/tools/network 下 YAML 的 7 个必填字段。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NetworkToolMeta {

    /** kebab-case，全局唯一 */
    private String id;

    /** 中文显示名 */
    private String name;

    /** inspector / generator / converter / analyzer / ai */
    private String category;

    /** MVP 阶段：1 纯前端 / 2 服务端代理 / 3 AI */
    private Integer phase;

    /** 一句话描述 */
    private String description;

    /** Ant Design 图标名 */
    private String icon;

    /** 前端路由，如 /tools/network/inspector/dns-query */
    private String route;
}
