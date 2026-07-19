package com.miao.toolbox.network.service;

import com.miao.toolbox.network.config.NetworkToolCatalog;
import com.miao.toolbox.network.dto.NetworkToolMeta;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("NetworkToolService 单元测试")
class NetworkToolServiceTest {

    @Test
    @DisplayName("listTools 返回 catalog 中的全部工具")
    void listTools_returnsCatalogTools() {
        NetworkToolMeta a = NetworkToolMeta.builder()
                .id("base64-codec")
                .name("编码解码")
                .category("converter")
                .phase(1)
                .description("codec")
                .icon("CodeOutlined")
                .route("/tools/network/converter/base64-codec")
                .build();
        NetworkToolMeta b = NetworkToolMeta.builder()
                .id("dns-query")
                .name("DNS 查询")
                .category("inspector")
                .phase(2)
                .description("dns")
                .icon("SearchOutlined")
                .route("/tools/network/inspector/dns-query")
                .build();

        NetworkToolService service = new NetworkToolService(new NetworkToolCatalog(List.of(a, b)));

        List<NetworkToolMeta> tools = service.listTools();
        assertThat(tools).containsExactly(a, b);
        assertThat(tools).hasSize(2);
    }

    @Test
    @DisplayName("listTools 返回不可变视图（修改会失败）")
    void listTools_isImmutable() {
        NetworkToolService service = new NetworkToolService(new NetworkToolCatalog(List.of(
                NetworkToolMeta.builder()
                        .id("x")
                        .name("X")
                        .category("ai")
                        .phase(3)
                        .description("d")
                        .icon("i")
                        .route("/tools/network/ai/x")
                        .build()
        )));

        List<NetworkToolMeta> tools = service.listTools();
        org.junit.jupiter.api.Assertions.assertThrows(UnsupportedOperationException.class, () ->
                tools.add(NetworkToolMeta.builder().id("y").build()));
    }
}
