package com.miao.toolbox.network.service;

import com.miao.toolbox.network.config.NetworkToolCatalog;
import com.miao.toolbox.network.dto.NetworkToolMeta;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 网络工具元数据查询服务。
 */
@Service
public class NetworkToolService {

    private final NetworkToolCatalog catalog;

    public NetworkToolService(NetworkToolCatalog catalog) {
        this.catalog = catalog;
    }

    /**
     * 返回全部网络工具元数据（已排序的不可变列表）。
     */
    public List<NetworkToolMeta> listTools() {
        return catalog.getTools();
    }
}
