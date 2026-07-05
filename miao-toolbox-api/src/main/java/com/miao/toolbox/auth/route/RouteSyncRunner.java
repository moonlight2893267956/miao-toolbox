package com.miao.toolbox.auth.route;

import com.miao.toolbox.auth.entity.Route;
import com.miao.toolbox.auth.repository.RouteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Properties;

@Slf4j
@Component
@RequiredArgsConstructor
public class RouteSyncRunner implements ApplicationRunner {

    private final RouteRepository routeRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        Properties props = loadRouteDefinitions();
        int index = 0;
        int inserted = 0;
        while (props.containsKey("routes[" + index + "].code")) {
            String prefix = "routes[" + index + "].";
            String code = props.getProperty(prefix + "code");
            if (!routeRepository.existsByCode(code)) {
                routeRepository.save(Route.builder()
                        .code(code)
                        .name(props.getProperty(prefix + "name"))
                        .path(props.getProperty(prefix + "path"))
                        .category(props.getProperty(prefix + "category"))
                        .icon(props.getProperty(prefix + "icon"))
                        .sortOrder(parseIntSafe(props.getProperty(prefix + "sortOrder", "0")))
                        .isAdminRoute(Boolean.parseBoolean(props.getProperty(prefix + "adminRoute", "false")))
                        .isEnabled(Boolean.parseBoolean(props.getProperty(prefix + "enabled", "true")))
                        .build());
                inserted++;
            }
            index++;
        }
        if (inserted > 0) {
            log.info("RouteSyncRunner inserted {} missing route definitions", inserted);
        }
    }

    private Properties loadRouteDefinitions() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("route-definitions.yml"));
        Properties props = yaml.getObject();
        return props != null ? props : new Properties();
    }

    private int parseIntSafe(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            log.warn("Invalid sortOrder in route-definitions.yml, defaulting to 0", e);
            return 0;
        }
    }
}
