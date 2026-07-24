package com.miao.toolbox.network.service;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.miao.toolbox.network.dto.WebhookCustomResponse;
import lombok.Getter;
import lombok.Setter;

/**
 * Webhook 端点元数据（Redis 存储结构，不对外暴露为 API DTO）。
 */
@Getter
@Setter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class WebhookMeta {

    /** 随机端点 ID。 */
    private String hookId;

    /** 创建时间戳（毫秒 epoch）。 */
    private long createdAt;

    /** 用户配置的自定义响应；null 表示使用默认响应。 */
    private WebhookCustomResponse customResponse;

    public WebhookMeta() {
    }

    public WebhookMeta(String hookId, long createdAt, WebhookCustomResponse customResponse) {
        this.hookId = hookId;
        this.createdAt = createdAt;
        this.customResponse = customResponse;
    }
}
