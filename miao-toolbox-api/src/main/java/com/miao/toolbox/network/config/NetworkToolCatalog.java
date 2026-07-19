package com.miao.toolbox.network.config;

import com.miao.toolbox.network.dto.NetworkToolMeta;

import java.util.List;

/**
 * 网络工具元数据目录（启动时由 {@link NetworkToolConfig} 加载）。
 */
public class NetworkToolCatalog {

    private final List<NetworkToolMeta> tools;

    public NetworkToolCatalog(List<NetworkToolMeta> tools) {
        this.tools = List.copyOf(tools);
    }

    public List<NetworkToolMeta> getTools() {
        return tools;
    }

    public int size() {
        return tools.size();
    }
}
