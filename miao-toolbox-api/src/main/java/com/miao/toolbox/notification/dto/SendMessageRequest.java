package com.miao.toolbox.notification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SendMessageRequest {

    @NotBlank(message = "标题不能为空")
    @Size(max = 200, message = "标题不能超过200字")
    private String title;

    @NotBlank(message = "内容不能为空")
    private String content;

    @Builder.Default
    private String type = "SYSTEM";

    @Builder.Default
    private String priority = "NORMAL";

    /** 发送范围：BROADCAST=全员广播，TARGETED=定向发送 */
    @Builder.Default
    private String scope = "BROADCAST";

    /** 定向用户 ID 列表，scope=TARGETED 时必填 */
    private List<Long> userIds;
}
