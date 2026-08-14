package com.miao.toolbox.notification.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MessageResponse {

    private Long id;
    private String title;
    private String summary;
    private String type;
    private String priority;
    private Long senderId;
    private boolean read;
    private LocalDateTime createdAt;
    /** 管理员视角：是否已删除 */
    private boolean deleted;
    /** 管理员视角：编辑时间 */
    private LocalDateTime editedAt;
    /** 管理员视角：接收人数 */
    private Integer recipientCount;
    /** 管理员视角：发送范围 BROADCAST/TARGETED */
    private String scope;
    /** 是否含配图（列表仅返回布尔标识，不加载图片本身） */
    private boolean hasImage;
}
