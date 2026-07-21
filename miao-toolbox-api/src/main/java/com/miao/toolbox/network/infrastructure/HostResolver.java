package com.miao.toolbox.network.infrastructure;

import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * DNS 解析抽象，便于单元测试注入假解析结果（DNS 重绑定场景）。
 */
@FunctionalInterface
public interface HostResolver {

    /**
     * 解析主机名为 IP 地址列表。
     *
     * @param host 主机名或 IP 字面量
     * @return 至少一个地址
     * @throws UnknownHostException 无法解析
     */
    InetAddress[] resolve(String host) throws UnknownHostException;

    /** 默认实现：JDK InetAddress.getAllByName */
    static HostResolver jdk() {
        return InetAddress::getAllByName;
    }
}
