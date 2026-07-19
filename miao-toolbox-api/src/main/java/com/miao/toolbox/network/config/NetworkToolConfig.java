package com.miao.toolbox.network.config;

import com.miao.toolbox.network.dto.NetworkToolMeta;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 启动时从 classpath tools/network 目录下的 YAML 文件加载网络工具元数据。
 */
@Slf4j
@Configuration
public class NetworkToolConfig {

    private static final String TOOL_YAML_PATTERN = "classpath*:tools/network/**/*.yml";

    private static final List<String> REQUIRED_FIELDS = List.of(
            "id", "name", "category", "phase", "description", "icon", "route"
    );

    @Bean
    public NetworkToolCatalog networkToolCatalog() {
        List<NetworkToolMeta> tools = loadAll();
        tools.sort(Comparator
                .comparing(NetworkToolMeta::getCategory, Comparator.nullsLast(String::compareTo))
                .thenComparing(NetworkToolMeta::getPhase, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(NetworkToolMeta::getId, Comparator.nullsLast(String::compareTo)));
        log.info("NetworkToolConfig loaded {} network tool definitions", tools.size());
        return new NetworkToolCatalog(tools);
    }

    /**
     * 从 classpath 扫描并解析全部 YAML；供配置与单测复用。
     */
    public static List<NetworkToolMeta> loadAll() {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources;
        try {
            resources = resolver.getResources(TOOL_YAML_PATTERN);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to scan network tool YAML: " + TOOL_YAML_PATTERN, e);
        }

        if (resources.length == 0) {
            throw new IllegalStateException("No network tool YAML found under tools/network/");
        }

        Yaml yaml = new Yaml();
        List<NetworkToolMeta> tools = new ArrayList<>();
        Set<String> seenIds = new LinkedHashSet<>();

        for (Resource resource : resources) {
            String filename = resource.getFilename() != null ? resource.getFilename() : resource.getDescription();
            try (InputStream in = resource.getInputStream()) {
                Object loaded = yaml.load(in);
                if (!(loaded instanceof Map<?, ?> map)) {
                    throw new IllegalStateException("Network tool YAML must be a map: " + filename);
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> data = (Map<String, Object>) map;
                NetworkToolMeta meta = toMeta(data, filename);
                if (!seenIds.add(meta.getId())) {
                    throw new IllegalStateException("Duplicate network tool id: " + meta.getId()
                            + " (file: " + filename + ")");
                }
                tools.add(meta);
            } catch (IOException e) {
                throw new IllegalStateException("Failed to read network tool YAML: " + filename, e);
            }
        }

        return tools;
    }

    static NetworkToolMeta toMeta(Map<String, Object> data, String filename) {
        for (String field : REQUIRED_FIELDS) {
            if (!data.containsKey(field) || data.get(field) == null || isBlank(data.get(field))) {
                throw new IllegalStateException(
                        "Missing required field '" + field + "' in network tool YAML: " + filename);
            }
        }

        Integer phase = parsePhase(data.get("phase"), filename);

        return NetworkToolMeta.builder()
                .id(String.valueOf(data.get("id")).trim())
                .name(String.valueOf(data.get("name")).trim())
                .category(String.valueOf(data.get("category")).trim())
                .phase(phase)
                .description(String.valueOf(data.get("description")).trim())
                .icon(String.valueOf(data.get("icon")).trim())
                .route(String.valueOf(data.get("route")).trim())
                .build();
    }

    private static Integer parsePhase(Object value, String filename) {
        int phase;
        if (value instanceof Number number) {
            phase = number.intValue();
        } else {
            try {
                phase = Integer.parseInt(String.valueOf(value).trim());
            } catch (NumberFormatException e) {
                throw new IllegalStateException(
                        "Invalid phase in network tool YAML: " + filename + " (value=" + value + ")", e);
            }
        }
        if (phase < 1 || phase > 3) {
            throw new IllegalStateException(
                    "phase must be 1, 2 or 3 in network tool YAML: " + filename + " (value=" + phase + ")");
        }
        return phase;
    }

    private static boolean isBlank(Object value) {
        return String.valueOf(value).trim().isEmpty();
    }
}
