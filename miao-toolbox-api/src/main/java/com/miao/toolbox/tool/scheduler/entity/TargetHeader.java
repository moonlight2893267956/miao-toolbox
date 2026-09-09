package com.miao.toolbox.tool.scheduler.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * HTTP 请求头（{@link HttpTargetConfig} 内嵌）。
 *
 * <p>{@code sensitive=true} 的 value：
 * <ul>
 *   <li>持久化前经 SchedulerCryptoService AES-GCM 加密</li>
 *   <li>API 响应/执行记录中脱敏显示（前 4 后 4 + 星号）</li>
 *   <li>编辑时不回显明文，需重新输入</li>
 * </ul>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TargetHeader {

    /** 请求头名称（如 Authorization、X-API-Key） */
    private String name;

    /** 请求头值（敏感头为 AES-GCM 密文 Base64） */
    private String value;

    /** 是否敏感（加密存储 + 脱敏展示） */
    private boolean sensitive;
}
