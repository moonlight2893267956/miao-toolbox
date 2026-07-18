package com.miao.toolbox.tool.cron.dto;

import lombok.Data;

/**
 * Cron AI 多轮对话消息。
 */
@Data
public class CronAIMessage {

    /** 角色：user / assistant */
    private String role;

    /** 消息内容 */
    private String content;
}
