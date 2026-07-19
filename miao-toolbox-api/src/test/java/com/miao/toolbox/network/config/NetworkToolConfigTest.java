package com.miao.toolbox.network.config;

import com.miao.toolbox.network.dto.NetworkToolMeta;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("NetworkToolConfig YAML 加载测试")
class NetworkToolConfigTest {

    @Test
    @DisplayName("从 classpath 加载全部网络工具 YAML 且字段完整")
    void loadAll_fromClasspath_allFieldsPresent() {
        List<NetworkToolMeta> tools = NetworkToolConfig.loadAll();

        assertThat(tools).isNotEmpty();
        assertThat(tools).hasSizeGreaterThanOrEqualTo(30);

        Set<String> ids = tools.stream().map(NetworkToolMeta::getId).collect(Collectors.toSet());
        assertThat(ids).hasSize(tools.size());
        assertThat(ids).contains("dns-query", "base64-codec", "network-assistant", "tcp-ping");

        for (NetworkToolMeta tool : tools) {
            assertThat(tool.getId()).isNotBlank();
            assertThat(tool.getName()).isNotBlank();
            assertThat(tool.getCategory()).isNotBlank();
            assertThat(tool.getPhase()).isBetween(1, 3);
            assertThat(tool.getDescription()).isNotBlank();
            assertThat(tool.getIcon()).isNotBlank();
            assertThat(tool.getRoute()).startsWith("/tools/network/");
        }
    }

    @Test
    @DisplayName("catalog bean 按 category/phase/id 排序")
    void networkToolCatalog_isSorted() {
        NetworkToolCatalog catalog = new NetworkToolConfig().networkToolCatalog();
        List<NetworkToolMeta> tools = catalog.getTools();

        assertThat(tools).isNotEmpty();
        for (int i = 1; i < tools.size(); i++) {
            NetworkToolMeta prev = tools.get(i - 1);
            NetworkToolMeta curr = tools.get(i);
            int cmp = prev.getCategory().compareTo(curr.getCategory());
            if (cmp == 0) {
                cmp = Integer.compare(prev.getPhase(), curr.getPhase());
            }
            if (cmp == 0) {
                cmp = prev.getId().compareTo(curr.getId());
            }
            assertThat(cmp).isLessThanOrEqualTo(0);
        }
    }

    @Test
    @DisplayName("缺少必填字段时抛出 IllegalStateException")
    void toMeta_missingField_throws() {
        Map<String, Object> data = new HashMap<>();
        data.put("id", "x");
        data.put("name", "X");
        data.put("category", "converter");
        data.put("phase", 1);
        data.put("description", "d");
        data.put("icon", "Icon");
        // missing route

        assertThatThrownBy(() -> NetworkToolConfig.toMeta(data, "x.yml"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("route");
    }

    @Test
    @DisplayName("phase 非法时抛出")
    void toMeta_invalidPhase_throws() {
        Map<String, Object> data = validMap();
        data.put("phase", 9);

        assertThatThrownBy(() -> NetworkToolConfig.toMeta(data, "bad.yml"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("phase");
    }

    private Map<String, Object> validMap() {
        Map<String, Object> data = new HashMap<>();
        data.put("id", "x");
        data.put("name", "X");
        data.put("category", "converter");
        data.put("phase", 1);
        data.put("description", "d");
        data.put("icon", "Icon");
        data.put("route", "/tools/network/converter/x");
        return data;
    }
}
