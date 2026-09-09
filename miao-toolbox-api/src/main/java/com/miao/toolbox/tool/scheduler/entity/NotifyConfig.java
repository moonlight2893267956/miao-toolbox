package com.miao.toolbox.tool.scheduler.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 通知配置（FR-10/FR-11，存于 scheduled_tasks.notify_config JSON 列，可为空）。
 *
 * <p>webhook/email 均为空表示不通知。通知失败仅记日志，不影响执行结果，不重试。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotifyConfig {

    /** Webhook 回调通知（可为空） */
    private WebhookNotify webhook;

    /** 邮件通知（可为空） */
    private EmailNotify email;

    /** Webhook 回调配置 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WebhookNotify {
        /** 回调 URL（http/https，保存时经 SSRF 校验） */
        private String url;
        /** 触发条件（默认 ON_FAILURE） */
        private NotifyTrigger trigger;
    }

    /** 邮件通知配置 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EmailNotify {
        /** 收件人列表（多个） */
        private java.util.List<String> recipients;
        /** 触发条件（默认 ON_FAILURE） */
        private NotifyTrigger trigger;
    }
}
